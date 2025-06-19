// routes/freelance-profile.js - VERSION CORRIGÉE
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Middleware d'authentification
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false,
      error: 'Token d\'accès requis' 
    });
  }

  // Vérification JWT (à adapter selon votre middleware principal)
  const jwt = require('jsonwebtoken');
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'matrix-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ 
      success: false,
      error: 'Token invalide' 
    });
  }
};

// Middleware pour vérifier que l'utilisateur est un freelance
const requireFreelance = async (req, res, next) => {
  try {
    const [users] = await pool.execute(
      'SELECT user_type FROM users WHERE id = ? AND is_active = 1',
      [req.user.id]
    );

    if (users.length === 0 || users[0].user_type !== 'freelance') {
      return res.status(403).json({
        success: false,
        message: 'Accès réservé aux freelances'
      });
    }

    next();
  } catch (error) {
    console.error('❌ Erreur vérification freelance:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
};

// ✅ VALIDATION DES VALEURS ENUM - FONCTION UTILITAIRE
const validateProficiency = (level) => {
  const validLevels = ['debutant', 'intermediaire', 'avance', 'expert'];
  const normalizedLevel = level ? level.toLowerCase().trim() : '';
  
  // Mapping des variantes courantes vers les valeurs DB
  const levelMapping = {
    'débutant': 'debutant',
    'debutant': 'debutant', 
    'beginner': 'debutant',
    'novice': 'debutant',
    
    'intermédiaire': 'intermediaire',
    'intermediaire': 'intermediaire',
    'intermediate': 'intermediaire',
    'moyen': 'intermediaire',
    
    'avancé': 'avance',
    'avance': 'avance',
    'advanced': 'avance',
    'confirmé': 'avance',
    
    'expert': 'expert',
    'expertize': 'expert',
    'senior': 'expert',
    'maitre': 'expert'
  };
  
  const mappedLevel = levelMapping[normalizedLevel] || normalizedLevel;
  
  if (validLevels.includes(mappedLevel)) {
    return mappedLevel;
  }
  
  console.warn(`⚠️ Niveau de compétence invalide: "${level}" -> défaut: "intermediaire"`);
  return 'intermediaire'; // Valeur par défaut
};

// ✅ Route de santé
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Freelance Profile API is healthy',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /api/freelance-profile/health',
      'GET /api/freelance-profile',
      'PUT /api/freelance-profile',
      'GET /api/freelance-profile/stats',
      'POST /api/freelance-profile/skills',
      'DELETE /api/freelance-profile/skills/:skillId',
      'POST /api/freelance-profile/portfolio',
      'PUT /api/freelance-profile/portfolio/:projectId',
      'DELETE /api/freelance-profile/portfolio/:projectId'
    ]
  });
});

// ✅ GET /api/freelance-profile - Récupérer le profil du freelance connecté
router.get('/', authenticateToken, requireFreelance, async (req, res) => {
  try {
    console.log('👤 Récupération profil freelance pour utilisateur:', req.user.id);

    const [profiles] = await pool.execute(`
      SELECT 
        u.id, u.email, u.first_name, u.last_name, u.avatar, u.bio, 
        u.location, u.phone, u.website, u.created_at,
        fp.hourly_rate, fp.availability, fp.experience_years, 
        fp.completed_missions, fp.average_rating, fp.total_earnings, 
        fp.response_time_hours
      FROM users u
      LEFT JOIN freelance_profiles fp ON u.id = fp.user_id
      WHERE u.id = ? AND u.user_type = 'freelance'
    `, [req.user.id]);

    if (profiles.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Profil freelance non trouvé'
      });
    }

    const profile = profiles[0];

    // Récupérer les compétences
    const [skills] = await pool.execute(`
      SELECT s.id, s.name, us.proficiency as level
      FROM user_skills us
      JOIN skills s ON us.skill_id = s.id
      WHERE us.user_id = ?
      ORDER BY s.name
    `, [req.user.id]);

    // Récupérer les projets portfolio
    const [projects] = await pool.execute(`
      SELECT 
        pp.id, pp.title, pp.description, pp.image_url, pp.project_url,
        pp.technologies, pp.created_at
      FROM portfolio_projects pp
      WHERE pp.freelance_id = ?
      ORDER BY pp.created_at DESC
    `, [req.user.id]);

    const formattedProfile = {
      id: profile.id,
      userId: profile.id,
      fullName: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
      title: profile.bio?.split('.')[0] || 'Freelance',
      bio: profile.bio || '',
      hourlyRate: parseFloat(profile.hourly_rate) || 0,
      availability: Boolean(profile.availability),
      experienceYears: profile.experience_years || 0,
      completedMissions: profile.completed_missions || 0,
      averageRating: parseFloat(profile.average_rating) || 0,
      totalEarnings: parseFloat(profile.total_earnings) || 0,
      responseTimeHours: profile.response_time_hours || 24,
      skills: skills.map(skill => ({
        id: skill.id,
        name: skill.name,
        level: skill.level || 'intermediaire'
      })),
      portfolio: projects.map(project => ({
        id: project.id.toString(),
        title: project.title,
        description: project.description,
        imageUrl: project.image_url || 'https://via.placeholder.com/300x200',
        projectUrl: project.project_url || '',
        technologies: project.technologies ? JSON.parse(project.technologies) : [],
        createdAt: project.created_at
      })),
      createdAt: profile.created_at
    };

    console.log('✅ Profil freelance récupéré:', formattedProfile.fullName);

    res.json({
      success: true,
      profile: formattedProfile
    });

  } catch (error) {
    console.error('❌ Erreur récupération profil:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération du profil',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ PUT /api/freelance-profile - Mettre à jour le profil freelance (CORRIGÉ)
router.put('/', authenticateToken, requireFreelance, async (req, res) => {
  let connection;
  
  try {
    console.log('📝 Mise à jour profil freelance pour utilisateur:', req.user.id);
    console.log('📋 Données reçues:', JSON.stringify(req.body, null, 2));

    const {
      fullName,
      title,
      bio,
      hourlyRate,
      availability,
      experienceYears,
      responseTimeHours,
      skills
    } = req.body;

    // Validation des données entrantes
    if (!fullName || fullName.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Le nom complet est requis'
      });
    }

    if (!bio || bio.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'La bio est requise'
      });
    }

    if (hourlyRate && (isNaN(hourlyRate) || hourlyRate < 0)) {
      return res.status(400).json({
        success: false,
        message: 'Le tarif horaire doit être un nombre positif'
      });
    }

    if (experienceYears && (isNaN(experienceYears) || experienceYears < 0)) {
      return res.status(400).json({
        success: false,
        message: 'Les années d\'expérience doivent être un nombre positif'
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Séparer le nom complet
      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      console.log(`📝 Mise à jour utilisateur: ${firstName} ${lastName}`);

      // Mettre à jour la table users
      await connection.execute(`
        UPDATE users 
        SET first_name = ?, last_name = ?, bio = ?, updated_at = NOW()
        WHERE id = ?
      `, [firstName, lastName, bio.trim(), req.user.id]);

      // Mettre à jour le profil freelance (ou le créer s'il n'existe pas)
      console.log('📝 Mise à jour profil freelance...');
      await connection.execute(`
        INSERT INTO freelance_profiles 
        (user_id, hourly_rate, availability, experience_years, response_time_hours, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
        hourly_rate = VALUES(hourly_rate),
        availability = VALUES(availability),
        experience_years = VALUES(experience_years),
        response_time_hours = VALUES(response_time_hours),
        updated_at = NOW()
      `, [
        req.user.id,
        parseFloat(hourlyRate) || 0,
        availability !== undefined ? Boolean(availability) : true,
        parseInt(experienceYears) || 0,
        parseInt(responseTimeHours) || 24
      ]);

      // ✅ GESTION DES COMPÉTENCES CORRIGÉE
      if (skills && Array.isArray(skills) && skills.length > 0) {
        console.log('🎯 Mise à jour des compétences...');
        console.log('📋 Compétences reçues:', skills);

        // Supprimer les anciennes compétences
        await connection.execute(
          'DELETE FROM user_skills WHERE user_id = ?',
          [req.user.id]
        );

        // Ajouter les nouvelles compétences avec validation
        for (let i = 0; i < skills.length; i++) {
          const skill = skills[i];
          
          if (!skill || !skill.name || skill.name.trim().length === 0) {
            console.warn(`⚠️ Compétence ${i} ignorée: nom vide`);
            continue;
          }

          const skillName = skill.name.trim();
          const skillLevel = validateProficiency(skill.level);

          console.log(`🔧 Traitement compétence: "${skillName}" niveau: "${skill.level}" -> "${skillLevel}"`);

          try {
            // Vérifier si la compétence existe
            let [existingSkills] = await connection.execute(
              'SELECT id FROM skills WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))',
              [skillName]
            );

            let skillId;
            if (existingSkills.length > 0) {
              skillId = existingSkills[0].id;
              console.log(`✅ Compétence existante trouvée: ${skillName} (ID: ${skillId})`);
            } else {
              // Créer la nouvelle compétence
              console.log(`➕ Création nouvelle compétence: ${skillName}`);
              const [insertResult] = await connection.execute(
                'INSERT INTO skills (name, category, created_at) VALUES (?, ?, NOW())',
                [skillName, 'Général']
              );
              skillId = insertResult.insertId;
              console.log(`✅ Nouvelle compétence créée: ${skillName} (ID: ${skillId})`);
            }

            // Associer la compétence à l'utilisateur avec le niveau validé
            console.log(`🔗 Association compétence: user_id=${req.user.id}, skill_id=${skillId}, proficiency="${skillLevel}"`);
            
            await connection.execute(
              'INSERT INTO user_skills (user_id, skill_id, proficiency, created_at) VALUES (?, ?, ?, NOW())',
              [req.user.id, skillId, skillLevel]
            );

            console.log(`✅ Compétence associée: ${skillName} (${skillLevel})`);

          } catch (skillError) {
            console.error(`❌ Erreur compétence "${skillName}":`, skillError);
            // Continue avec les autres compétences au lieu de faire échouer toute la transaction
          }
        }
      }

      await connection.commit();
      console.log('✅ Profil freelance mis à jour avec succès');

      // Récupérer le profil mis à jour
      const [updatedProfile] = await pool.execute(`
        SELECT 
          u.id, u.first_name, u.last_name, u.bio,
          fp.hourly_rate, fp.availability, fp.experience_years, 
          fp.completed_missions, fp.average_rating, fp.total_earnings, 
          fp.response_time_hours
        FROM users u
        LEFT JOIN freelance_profiles fp ON u.id = fp.user_id
        WHERE u.id = ?
      `, [req.user.id]);

      // Récupérer les compétences mises à jour
      const [updatedSkills] = await pool.execute(`
        SELECT s.id, s.name, us.proficiency as level
        FROM user_skills us
        JOIN skills s ON us.skill_id = s.id
        WHERE us.user_id = ?
        ORDER BY s.name
      `, [req.user.id]);

      const profile = updatedProfile[0];
      const formattedProfile = {
        id: profile.id,
        fullName: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
        title: title || 'Freelance',
        bio: profile.bio,
        hourlyRate: parseFloat(profile.hourly_rate) || 0,
        availability: Boolean(profile.availability),
        experienceYears: profile.experience_years || 0,
        completedMissions: profile.completed_missions || 0,
        averageRating: parseFloat(profile.average_rating) || 0,
        totalEarnings: parseFloat(profile.total_earnings) || 0,
        responseTimeHours: profile.response_time_hours || 24,
        skills: updatedSkills.map(skill => ({
          id: skill.id,
          name: skill.name,
          level: skill.level
        }))
      };

      res.json({
        success: true,
        message: 'Profil mis à jour avec succès',
        profile: formattedProfile
      });

    } catch (transactionError) {
      await connection.rollback();
      console.error('❌ Erreur dans la transaction:', transactionError);
      throw transactionError;
    }

  } catch (error) {
    console.error('❌ Erreur mise à jour profil:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour du profil',
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        code: error.code,
        sql: error.sql
      } : undefined
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// ✅ GET /api/freelance-profile/stats - Statistiques du freelance
router.get('/stats', authenticateToken, requireFreelance, async (req, res) => {
  try {
    console.log('📊 Récupération stats freelance pour:', req.user.id);

    const [stats] = await pool.execute(`
      SELECT 
        fp.completed_missions,
        fp.average_rating,
        fp.total_earnings,
        fp.response_time_hours,
        (SELECT COUNT(*) FROM applications WHERE freelance_id = ? AND status = 'pending') as pending_applications,
        (SELECT COUNT(*) FROM missions WHERE assigned_freelance_id = ? AND status = 'in_progress') as active_missions
      FROM freelance_profiles fp
      WHERE fp.user_id = ?
    `, [req.user.id, req.user.id, req.user.id]);

    const freelanceStats = stats[0] || {
      completed_missions: 0,
      average_rating: 0,
      total_earnings: 0,
      response_time_hours: 24,
      pending_applications: 0,
      active_missions: 0
    };

    res.json({
      success: true,
      stats: {
        completed_missions: freelanceStats.completed_missions || 0,
        average_rating: parseFloat(freelanceStats.average_rating) || 0,
        total_earnings: parseFloat(freelanceStats.total_earnings) || 0,
        response_time_hours: freelanceStats.response_time_hours || 24,
        pending_applications: freelanceStats.pending_applications || 0,
        active_missions: freelanceStats.active_missions || 0
      }
    });

  } catch (error) {
    console.error('❌ Erreur stats freelance:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des statistiques'
    });
  }
});

// ✅ POST /api/freelance-profile/portfolio - Ajouter un projet au portfolio (CORRIGÉ)
router.post('/portfolio', authenticateToken, requireFreelance, async (req, res) => {
  try {
    console.log('📁 Ajout projet portfolio pour:', req.user.id);
    console.log('📋 Données projet reçues:', JSON.stringify(req.body, null, 2));

    const { title, description, imageUrl, projectUrl, technologies } = req.body;

    // Validation des données
    if (!title || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Le titre du projet est requis'
      });
    }

    if (!description || description.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'La description du projet est requise'
      });
    }

    // Validation des technologies (doit être un array)
    let techArray = [];
    if (technologies) {
      if (Array.isArray(technologies)) {
        techArray = technologies.filter(tech => tech && tech.trim().length > 0);
      } else if (typeof technologies === 'string') {
        try {
          techArray = JSON.parse(technologies);
        } catch (e) {
          techArray = [technologies];
        }
      }
    }

    const [result] = await pool.execute(`
      INSERT INTO portfolio_projects 
      (freelance_id, title, description, image_url, project_url, technologies, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, [
      req.user.id,
      title.trim(),
      description.trim(),
      imageUrl && imageUrl.trim().length > 0 ? imageUrl.trim() : null,
      projectUrl && projectUrl.trim().length > 0 ? projectUrl.trim() : null,
      techArray.length > 0 ? JSON.stringify(techArray) : null
    ]);

    const projectId = result.insertId;

    console.log('✅ Projet portfolio créé avec ID:', projectId);

    res.json({
      success: true,
      message: 'Projet ajouté au portfolio avec succès',
      project: {
        id: projectId.toString(),
        title: title.trim(),
        description: description.trim(),
        imageUrl: imageUrl || 'https://via.placeholder.com/300x200',
        projectUrl: projectUrl || '',
        technologies: techArray,
        createdAt: new Date()
      }
    });

  } catch (error) {
    console.error('❌ Erreur ajout portfolio:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'ajout du projet',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ PUT /api/freelance-profile/portfolio/:id - Mettre à jour un projet (CORRIGÉ)
router.put('/portfolio/:id', authenticateToken, requireFreelance, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, imageUrl, projectUrl, technologies } = req.body;

    console.log('📝 Mise à jour projet portfolio:', id);
    console.log('📋 Données projet reçues:', JSON.stringify(req.body, null, 2));

    // Validation des données
    if (!title || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Le titre du projet est requis'
      });
    }

    if (!description || description.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'La description du projet est requise'
      });
    }

    // Validation des technologies
    let techArray = [];
    if (technologies) {
      if (Array.isArray(technologies)) {
        techArray = technologies.filter(tech => tech && tech.trim().length > 0);
      } else if (typeof technologies === 'string') {
        try {
          techArray = JSON.parse(technologies);
        } catch (e) {
          techArray = [technologies];
        }
      }
    }

    const [result] = await pool.execute(`
      UPDATE portfolio_projects 
      SET title = ?, description = ?, image_url = ?, project_url = ?, 
          technologies = ?, updated_at = NOW()
      WHERE id = ? AND freelance_id = ?
    `, [
      title.trim(),
      description.trim(),
      imageUrl && imageUrl.trim().length > 0 ? imageUrl.trim() : null,
      projectUrl && projectUrl.trim().length > 0 ? projectUrl.trim() : null,
      techArray.length > 0 ? JSON.stringify(techArray) : null,
      id,
      req.user.id
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Projet non trouvé ou non autorisé'
      });
    }

    console.log('✅ Projet portfolio mis à jour');

    res.json({
      success: true,
      message: 'Projet mis à jour avec succès'
    });

  } catch (error) {
    console.error('❌ Erreur mise à jour portfolio:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ DELETE /api/freelance-profile/portfolio/:id - Supprimer un projet du portfolio
router.delete('/portfolio/:id', authenticateToken, requireFreelance, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🗑️ Suppression projet portfolio:', id);

    const [result] = await pool.execute(
      'DELETE FROM portfolio_projects WHERE id = ? AND freelance_id = ?',
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Projet non trouvé ou non autorisé'
      });
    }

    console.log('✅ Projet portfolio supprimé');

    res.json({
      success: true,
      message: 'Projet supprimé du portfolio avec succès'
    });

  } catch (error) {
    console.error('❌ Erreur suppression portfolio:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression'
    });
  }
});

// ✅ POST /api/freelance-profile/skills - Ajouter une compétence (NOUVELLE ROUTE)
router.post('/skills', authenticateToken, requireFreelance, async (req, res) => {
  try {
    console.log('🎯 Ajout compétence pour:', req.user.id);
    console.log('📋 Données compétence reçues:', JSON.stringify(req.body, null, 2));

    const { name, level } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Le nom de la compétence est requis'
      });
    }

    const skillName = name.trim();
    const skillLevel = validateProficiency(level);

    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Vérifier si la compétence existe déjà pour cet utilisateur
      const [existingUserSkill] = await connection.execute(`
        SELECT us.skill_id 
        FROM user_skills us 
        JOIN skills s ON us.skill_id = s.id 
        WHERE us.user_id = ? AND LOWER(TRIM(s.name)) = LOWER(TRIM(?))
      `, [req.user.id, skillName]);

      if (existingUserSkill.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cette compétence existe déjà dans votre profil'
        });
      }

      // Vérifier si la compétence existe dans la table skills
      let [existingSkills] = await connection.execute(
        'SELECT id FROM skills WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))',
        [skillName]
      );

      let skillId;
      if (existingSkills.length > 0) {
        skillId = existingSkills[0].id;
        console.log(`✅ Compétence existante trouvée: ${skillName} (ID: ${skillId})`);
      } else {
        // Créer la nouvelle compétence
        console.log(`➕ Création nouvelle compétence: ${skillName}`);
        const [insertResult] = await connection.execute(
          'INSERT INTO skills (name, category, created_at) VALUES (?, ?, NOW())',
          [skillName, 'Général']
        );
        skillId = insertResult.insertId;
        console.log(`✅ Nouvelle compétence créée: ${skillName} (ID: ${skillId})`);
      }

      // Associer la compétence à l'utilisateur
      await connection.execute(
        'INSERT INTO user_skills (user_id, skill_id, proficiency, created_at) VALUES (?, ?, ?, NOW())',
        [req.user.id, skillId, skillLevel]
      );

      await connection.commit();
      console.log(`✅ Compétence ajoutée: ${skillName} (${skillLevel})`);

      res.json({
        success: true,
        message: 'Compétence ajoutée avec succès',
        skill: {
          id: skillId,
          name: skillName,
          level: skillLevel
        }
      });

    } catch (transactionError) {
      if (connection) await connection.rollback();
      throw transactionError;
    } finally {
      if (connection) connection.release();
    }

  } catch (error) {
    console.error('❌ Erreur ajout compétence:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'ajout de la compétence',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ DELETE /api/freelance-profile/skills/:skillId - Supprimer une compétence
router.delete('/skills/:skillId', authenticateToken, requireFreelance, async (req, res) => {
  try {
    const { skillId } = req.params;
    console.log('🗑️ Suppression compétence:', skillId);

    const [result] = await pool.execute(
      'DELETE FROM user_skills WHERE user_id = ? AND skill_id = ?',
      [req.user.id, skillId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Compétence non trouvée'
      });
    }

    console.log('✅ Compétence supprimée');

    res.json({
      success: true,
      message: 'Compétence supprimée avec succès'
    });

  } catch (error) {
    console.error('❌ Erreur suppression compétence:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression'
    });
  }
});

// ✅ PUT /api/freelance-profile/skills/:skillId - Mettre à jour une compétence
router.put('/skills/:skillId', authenticateToken, requireFreelance, async (req, res) => {
  try {
    const { skillId } = req.params;
    const { level } = req.body;
    
    console.log('📝 Mise à jour niveau compétence:', skillId);

    if (!level) {
      return res.status(400).json({
        success: false,
        message: 'Le niveau de compétence est requis'
      });
    }

    const skillLevel = validateProficiency(level);

    const [result] = await pool.execute(
      'UPDATE user_skills SET proficiency = ? WHERE user_id = ? AND skill_id = ?',
      [skillLevel, req.user.id, skillId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Compétence non trouvée'
      });
    }

    console.log('✅ Niveau de compétence mis à jour');

    res.json({
      success: true,
      message: 'Niveau de compétence mis à jour avec succès'
    });

  } catch (error) {
    console.error('❌ Erreur mise à jour compétence:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour'
    });
  }
});

module.exports = router;