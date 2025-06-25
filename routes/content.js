// routes/content.js - Système de contenus et posts - MISE À JOUR FRONTEND SYNC
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { pool } = require('../config/database');

// Configuration multer pour l'upload de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/content/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 5 // Max 5 fichiers
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = {
      'image/jpeg': true,
      'image/jpg': true,
      'image/png': true,
      'image/gif': true,
      'image/webp': true,
      'video/mp4': true,
      'video/webm': true,
      'video/ogg': true,
      'video/avi': true,
      'video/mov': true,
      'application/pdf': true,
      'application/msword': true,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
      'text/plain': true
    };

    if (allowedTypes[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error(`Type de fichier non supporté: ${file.mimetype}`), false);
    }
  }
});

// Middleware d'authentification
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token manquant'
      });
    }
    
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'matrix-secret-key');
    
    const [users] = await pool.execute(
      'SELECT id, email, user_type, first_name, last_name, avatar, bio FROM users WHERE id = ? AND is_active = 1',
      [decoded.id]
    );
    
    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Token invalide'
      });
    }
    
    req.user = users[0];
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Token invalide'
    });
  }
};

// GET /api/content/posts - Récupérer les posts avec pagination
router.get('/posts', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    console.log(`📋 Récupération posts page ${page} pour utilisateur:`, req.user.id);

    const [posts] = await pool.execute(`
      SELECT 
        p.*,
        u.first_name,
        u.last_name,
        u.avatar,
        u.user_type,
        u.bio,
        COALESCE(fp.experience_years, 0) as experience_years,
        COALESCE(fp.average_rating, 0) as average_rating,
        COALESCE(fp.completed_missions, 0) as completed_missions,
        (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as likes_count,
        (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comments_count,
        (SELECT COUNT(*) FROM post_shares WHERE post_id = p.id) as shares_count,
        (SELECT COUNT(*) > 0 FROM post_likes WHERE post_id = p.id AND user_id = ?) as is_liked_by_user
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN freelance_profiles fp ON u.id = fp.user_id AND u.user_type = 'freelance'
      WHERE p.status = 'published'
      ORDER BY 
        CASE WHEN p.is_urgent = 1 THEN 0 ELSE 1 END,
        p.created_at DESC
      LIMIT ? OFFSET ?
    `, [req.user.id, parseInt(limit), parseInt(offset)]);

    // Formater les posts selon l'interface Frontend exacte
    const formattedPosts = posts.map(post => {
      // Gestion de la spécialité
      let speciality = '';
      if (post.user_type === 'freelance') {
        speciality = post.bio ? post.bio.split('.')[0] : 'Freelance';
      } else if (post.user_type === 'client') {
        speciality = 'Client';
      }

      // Parser les données JSON - STRUCTURE EXACTE FRONTEND
      let content = {
        text: post.content_text || null,
        images: [],
        videos: [],
        documents: [],
        project: null
      };

      // Parsing amélioré des images avec séparation par type
      if (post.content_images) {
        try {
          const allFiles = JSON.parse(post.content_images);
          content.images = allFiles.filter(file => {
            if (typeof file === 'string') {
              return file.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            }
            return file.type && file.type.startsWith('image/');
          }).map(file => typeof file === 'string' ? file : file.url);
          
          content.videos = allFiles.filter(file => {
            if (typeof file === 'string') {
              return file.match(/\.(mp4|webm|ogg|avi|mov)$/i);
            }
            return file.type && file.type.startsWith('video/');
          }).map(file => typeof file === 'string' ? file : file.url);
          
          content.documents = allFiles.filter(file => {
            if (typeof file === 'string') {
              return file.match(/\.(pdf|doc|docx|txt)$/i);
            }
            return file.type && (file.type.includes('pdf') || file.type.includes('document') || file.type.includes('text'));
          }).map(file => typeof file === 'string' ? file : (file.url || file.name));
        } catch (e) {
          console.error('Erreur parsing fichiers:', e);
          content.images = [];
          content.videos = [];
          content.documents = [];
        }
      }

      if (post.project_data) {
        try {
          content.project = JSON.parse(post.project_data);
        } catch (e) {
          content.project = null;
        }
      }

      return {
        id: post.id.toString(),
        user: {
          id: post.user_id.toString(),
          name: `${post.first_name} ${post.last_name}`,
          avatar: post.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
          type: post.user_type,
          speciality: speciality
        },
        content: content,
        interactions: {
          likes: parseInt(post.likes_count) || 0,
          comments: parseInt(post.comments_count) || 0,
          shares: parseInt(post.shares_count) || 0,
          isLiked: Boolean(post.is_liked_by_user)
        },
        createdAt: post.created_at,
        type: post.post_type || 'text',
        isUrgent: Boolean(post.is_urgent)
      };
    });

    console.log(`✅ ${formattedPosts.length} posts récupérés`);

    res.json({
      success: true,
      posts: formattedPosts
    });

  } catch (error) {
    console.error('❌ Erreur récupération posts:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des posts'
    });
  }
});

// POST /api/content/posts - Créer un nouveau post avec upload de fichiers
router.post('/posts', authMiddleware, upload.array('files', 5), async (req, res) => {
  let connection;
  
  try {
    console.log('📝 Création nouveau post par utilisateur:', req.user.id);
    console.log('📎 Fichiers uploadés:', req.files?.length || 0);
    
    const {
      title,
      content,
      type: post_type = 'text',
      isUrgent = false,
      // Données projet
      projectTitle,
      projectDescription,
      projectTechnologies,
      projectBudget,
      projectDuration
    } = req.body;

    // Validation
    if (!content || content.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Le contenu doit contenir au moins 10 caractères'
      });
    }

    // Validation spécifique pour les projets
    if (post_type === 'project') {
      if (!projectTitle || !projectDescription) {
        return res.status(400).json({
          success: false,
          message: 'Titre et description du projet sont requis'
        });
      }
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Traiter les fichiers uploadés
      let filesData = [];
      if (req.files && req.files.length > 0) {
        filesData = req.files.map(file => {
          const baseUrl = `${req.protocol}://${req.get('host')}`;
          return {
            name: file.originalname,
            url: `${baseUrl}/uploads/content/${file.filename}`,
            type: file.mimetype,
            size: file.size
          };
        });
      }

      // Préparer les données du projet si applicable
      let projectData = null;
      if (post_type === 'project') {
        projectData = {
          title: projectTitle,
          description: projectDescription,
          technologies: projectTechnologies ? 
            (typeof projectTechnologies === 'string' ? 
              JSON.parse(projectTechnologies) : projectTechnologies) : [],
          budget: projectBudget || undefined,
          duration: projectDuration || undefined
        };
      }

      // Créer le post
      const [result] = await connection.execute(`
        INSERT INTO posts (
          user_id, content_text, content_images, project_data, 
          post_type, is_urgent, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'published', NOW(), NOW())
      `, [
        req.user.id,
        content.trim(),
        filesData.length > 0 ? JSON.stringify(filesData) : null,
        projectData ? JSON.stringify(projectData) : null,
        post_type,
        Boolean(isUrgent)
      ]);

      const postId = result.insertId;
      await connection.commit();

      console.log('✅ Post créé avec ID:', postId);

      // Récupérer le post complet pour la réponse
      const [newPost] = await pool.execute(`
        SELECT 
          p.*,
          u.first_name,
          u.last_name,
          u.avatar,
          u.user_type,
          u.bio
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.id = ?
      `, [postId]);

      const post = newPost[0];
      let speciality = '';
      if (post.user_type === 'freelance') {
        speciality = post.bio ? post.bio.split('.')[0] : 'Freelance';
      } else if (post.user_type === 'client') {
        speciality = 'Client';
      }

      // Séparer les fichiers par type pour la réponse
      let content_formatted = {
        text: post.content_text,
        images: [],
        videos: [],
        documents: [],
        project: post.project_data ? JSON.parse(post.project_data) : null
      };

      if (filesData.length > 0) {
        content_formatted.images = filesData.filter(f => f.type.startsWith('image/')).map(f => f.url);
        content_formatted.videos = filesData.filter(f => f.type.startsWith('video/')).map(f => f.url);
        content_formatted.documents = filesData.filter(f => 
          f.type.includes('pdf') || f.type.includes('document') || f.type.includes('text')
        ).map(f => f.name);
      }

      const formattedPost = {
        id: post.id.toString(),
        user: {
          id: post.user_id.toString(),
          name: `${post.first_name} ${post.last_name}`,
          avatar: post.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
          type: post.user_type,
          speciality: speciality
        },
        content: content_formatted,
        interactions: {
          likes: 0,
          comments: 0,
          shares: 0,
          isLiked: false
        },
        createdAt: post.created_at,
        type: post.post_type,
        isUrgent: Boolean(post.is_urgent)
      };

      res.status(201).json({
        success: true,
        message: 'Post créé avec succès',
        post: formattedPost
      });

    } catch (error) {
      await connection.rollback();
      // Supprimer les fichiers uploadés en cas d'erreur
      if (req.files) {
        req.files.forEach(file => {
          fs.unlink(file.path, (err) => {
            if (err) console.error('Erreur suppression fichier:', err);
          });
        });
      }
      throw error;
    }

  } catch (error) {
    console.error('❌ Erreur création post:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la création du post',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// POST /api/content/posts/:id/like - Liker/unliker un post
router.post('/posts/:id/like', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`❤️ Toggle like post ${id} par utilisateur:`, req.user.id);

    // Vérifier si le post existe
    const [posts] = await pool.execute(
      'SELECT id FROM posts WHERE id = ? AND status = "published"',
      [id]
    );

    if (posts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post non trouvé'
      });
    }

    // Vérifier si l'utilisateur a déjà liké
    const [existingLikes] = await pool.execute(
      'SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?',
      [id, req.user.id]
    );

    let isLiked;
    let likesCount;

    if (existingLikes.length > 0) {
      // Supprimer le like
      await pool.execute(
        'DELETE FROM post_likes WHERE post_id = ? AND user_id = ?',
        [id, req.user.id]
      );
      isLiked = false;
    } else {
      // Ajouter le like
      await pool.execute(
        'INSERT INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, NOW())',
        [id, req.user.id]
      );
      isLiked = true;
    }

    // Récupérer le nouveau nombre de likes
    const [likesResult] = await pool.execute(
      'SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?',
      [id]
    );
    likesCount = likesResult[0].count;

    console.log(`✅ Like toggled: ${isLiked ? 'ajouté' : 'supprimé'}`);

    res.json({
      success: true,
      data: {
        isLiked: isLiked,
        likesCount: likesCount
      }
    });

  } catch (error) {
    console.error('❌ Erreur toggle like:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du like'
    });
  }
});

// POST /api/content/posts/:id/comment - Ajouter un commentaire
router.post('/posts/:id/comment', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    console.log(`💬 Ajout commentaire post ${id} par:`, req.user.id);

    if (!comment || !comment.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Le commentaire ne peut pas être vide'
      });
    }

    if (comment.trim().length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Le commentaire ne peut pas dépasser 500 caractères'
      });
    }

    // Vérifier que le post existe
    const [posts] = await pool.execute(
      'SELECT id FROM posts WHERE id = ? AND status = "published"',
      [id]
    );

    if (posts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post non trouvé'
      });
    }

    // Ajouter le commentaire
    await pool.execute(
      'INSERT INTO post_comments (post_id, user_id, content, created_at) VALUES (?, ?, ?, NOW())',
      [id, req.user.id, comment.trim()]
    );

    // Récupérer le nouveau nombre de commentaires
    const [commentsResult] = await pool.execute(
      'SELECT COUNT(*) as count FROM post_comments WHERE post_id = ?',
      [id]
    );

    console.log('✅ Commentaire ajouté');

    res.json({
      success: true,
      data: {
        commentsCount: commentsResult[0].count
      }
    });

  } catch (error) {
    console.error('❌ Erreur ajout commentaire:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'ajout du commentaire'
    });
  }
});

// POST /api/content/posts/:id/share - Partager un post
router.post('/posts/:id/share', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔄 Partage post ${id} par:`, req.user.id);

    // Vérifier que le post existe
    const [posts] = await pool.execute(
      'SELECT id FROM posts WHERE id = ? AND status = "published"',
      [id]
    );

    if (posts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post non trouvé'
      });
    }

    // Ajouter le partage (éviter les doublons)
    await pool.execute(
      'INSERT IGNORE INTO post_shares (post_id, user_id, created_at) VALUES (?, ?, NOW())',
      [id, req.user.id]
    );

    // Récupérer le nouveau nombre de partages
    const [sharesResult] = await pool.execute(
      'SELECT COUNT(*) as count FROM post_shares WHERE post_id = ?',
      [id]
    );

    console.log('✅ Post partagé');

    res.json({
      success: true,
      data: {
        sharesCount: sharesResult[0].count
      }
    });

  } catch (error) {
    console.error('❌ Erreur partage post:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du partage'
    });
  }
});

// GET /api/content/users/:id/profile - Récupérer le profil public d'un utilisateur
router.get('/users/:id/profile', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('👤 Récupération profil public utilisateur:', id);

    const [users] = await pool.execute(`
      SELECT 
        u.id, u.first_name, u.last_name, u.avatar, u.bio, 
        u.location, u.website, u.user_type, u.created_at,
        fp.hourly_rate, fp.experience_years, fp.completed_missions, 
        fp.average_rating, fp.availability, fp.response_time_hours
      FROM users u
      LEFT JOIN freelance_profiles fp ON u.id = fp.user_id AND u.user_type = 'freelance'
      WHERE u.id = ? AND u.is_active = 1
    `, [id]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const user = users[0];

    // Récupérer les compétences si c'est un freelance
    let skills = [];
    if (user.user_type === 'freelance') {
      const [skillsResult] = await pool.execute(`
        SELECT s.name, us.proficiency
        FROM user_skills us
        JOIN skills s ON us.skill_id = s.id
        WHERE us.user_id = ?
        ORDER BY s.name
      `, [id]);
      skills = skillsResult;
    }

    // Récupérer les projets portfolio si c'est un freelance
    let portfolio = [];
    if (user.user_type === 'freelance') {
      try {
        const [portfolioResult] = await pool.execute(`
          SELECT id, title, description, image_url, project_url, technologies
          FROM portfolio_projects
          WHERE freelance_id = ?
          ORDER BY created_at DESC
          LIMIT 6
        `, [id]);
        
        portfolio = portfolioResult.map(project => ({
          id: project.id.toString(),
          title: project.title,
          description: project.description,
          imageUrl: project.image_url || 'https://via.placeholder.com/300x200',
          projectUrl: project.project_url || '',
          technologies: project.technologies ? JSON.parse(project.technologies) : []
        }));
      } catch (e) {
        console.log('⚠️ Table portfolio_projects non disponible');
      }
    }

    // Récupérer quelques posts récents
    const [recentPosts] = await pool.execute(`
      SELECT id, content_text, post_type, created_at
      FROM posts
      WHERE user_id = ? AND status = 'published'
      ORDER BY created_at DESC
      LIMIT 3
    `, [id]);

    const formattedProfile = {
      id: user.id.toString(),
      name: `${user.first_name} ${user.last_name}`,
      avatar: user.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
      bio: user.bio || '',
      location: user.location || '',
      website: user.website || '',
      userType: user.user_type,
      memberSince: user.created_at,
      skills: skills,
      portfolio: portfolio,
      recentPosts: recentPosts.map(post => ({
        id: post.id.toString(),
        content: post.content_text,
        type: post.post_type,
        createdAt: post.created_at
      }))
    };

    // Ajouter les données freelance si applicable
    if (user.user_type === 'freelance') {
      formattedProfile.freelanceProfile = {
        hourlyRate: parseFloat(user.hourly_rate) || 0,
        experienceYears: user.experience_years || 0,
        completedMissions: user.completed_missions || 0,
        averageRating: parseFloat(user.average_rating) || 0,
        availability: Boolean(user.availability),
        responseTimeHours: user.response_time_hours || 24
      };
    }

    console.log('✅ Profil public récupéré:', formattedProfile.name);

    res.json({
      success: true,
      profile: formattedProfile
    });

  } catch (error) {
    console.error('❌ Erreur récupération profil public:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération du profil'
    });
  }
});

// Middleware de gestion d'erreurs pour multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Fichier trop volumineux (max 50MB)'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Trop de fichiers (max 5)'
      });
    }
  }
  
  if (error.message.includes('Type de fichier non supporté')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  next(error);
});

module.exports = router;