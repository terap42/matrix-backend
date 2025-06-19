// server.js - VERSION COMPLÈTE AVEC INSCRIPTION
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { testConnection, pool } = require('./config/database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['http://localhost:8100', 'http://localhost:4200'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Log des requetes en mode developpement
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// ✅ MIDDLEWARE D'AUTHENTIFICATION CORRIGÉ
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Accès refusé. Token manquant.'
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'matrix-secret-key');
    
    const [users] = await pool.execute(
      'SELECT id, email, user_type, is_active, first_name, last_name FROM users WHERE id = ?',
      [decoded.id]
    );
    
    if (users.length === 0 || !users[0].is_active) {
      return res.status(401).json({
        success: false,
        message: 'Token invalide.'
      });
    }
    
    req.user = {
      id: users[0].id,
      email: users[0].email,
      userType: users[0].user_type,
      firstName: users[0].first_name,
      lastName: users[0].last_name
    };
    
    next();
  } catch (error) {
    console.error('❌ Erreur auth middleware:', error);
    res.status(401).json({
      success: false,
      message: 'Token invalide.'
    });
  }
};

// ✅ FONCTION HELPER POUR GÉRER LES SKILLS - CORRIGÉE
async function handleMissionSkills(skillNames, missionId, connection) {
  try {
    console.log('🔧 Traitement skills pour mission:', missionId, skillNames);
    
    if (!skillNames || skillNames.length === 0) {
      console.log('⚠️ Aucun skill fourni');
      return [];
    }

    const skillIds = [];
    
    for (const skillName of skillNames) {
      if (!skillName || !skillName.trim()) continue;
      
      const trimmedSkill = skillName.trim();
      
      // Vérifier si le skill existe déjà
      const [existingSkills] = await connection.execute(
        'SELECT id FROM skills WHERE LOWER(name) = LOWER(?)',
        [trimmedSkill]
      );
      
      let skillId;
      
      if (existingSkills.length > 0) {
        // Skill existe déjà
        skillId = existingSkills[0].id;
        console.log(`✅ Skill existant trouvé: ${trimmedSkill} (ID: ${skillId})`);
      } else {
        // Créer un nouveau skill
        try {
          const [insertResult] = await connection.execute(
            'INSERT INTO skills (name, category) VALUES (?, ?)',
            [trimmedSkill, 'général']
          );
          skillId = insertResult.insertId;
          console.log(`✅ Nouveau skill créé: ${trimmedSkill} (ID: ${skillId})`);
        } catch (insertError) {
          console.error(`❌ Erreur insertion skill ${trimmedSkill}:`, insertError);
          const [retrySkills] = await connection.execute(
            'SELECT id FROM skills WHERE LOWER(name) = LOWER(?)',
            [trimmedSkill]
          );
          if (retrySkills.length > 0) {
            skillId = retrySkills[0].id;
            console.log(`✅ Skill récupéré après erreur: ${trimmedSkill} (ID: ${skillId})`);
          } else {
            console.error(`❌ Impossible de créer/récupérer skill: ${trimmedSkill}`);
            continue;
          }
        }
      }
      
      if (skillId) {
        skillIds.push(skillId);
        
        // Associer le skill à la mission
        try {
          await connection.execute(
            'INSERT IGNORE INTO mission_skills (mission_id, skill_id) VALUES (?, ?)',
            [missionId, skillId]
          );
          console.log(`✅ Skill ${trimmedSkill} associé à la mission ${missionId}`);
        } catch (linkError) {
          console.error(`❌ Erreur association skill ${trimmedSkill} à mission ${missionId}:`, linkError);
        }
      }
    }
    
    console.log(`✅ ${skillIds.length} skills traités pour la mission ${missionId}`);
    return skillIds;
    
  } catch (error) {
    console.error('❌ Erreur traitement skills:', error);
    throw error;
  }
}

// ✅ ======== ROUTES MISSIONS COMPLÈTES ========

// GET /api/missions - Liste des missions avec filtres
app.get('/api/missions', authMiddleware, async (req, res) => {
  try {
    console.log('📋 Récupération missions pour utilisateur:', req.user.id);
    
    const {
      page = 1,
      limit = 10,
      status,
      category,
      search,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    let whereConditions = [];
    let queryParams = [];

    if (status) {
      whereConditions.push('m.status = ?');
      queryParams.push(status);
    }

    if (category) {
      whereConditions.push('m.category = ?');
      queryParams.push(category);
    }

    if (search) {
      whereConditions.push('(m.title LIKE ? OR m.description LIKE ?)');
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    const query = `
      SELECT 
        m.*,
        u.first_name,
        u.last_name,
        u.email as client_email,
        u.avatar as client_avatar,
        COALESCE((SELECT COUNT(*) FROM applications WHERE mission_id = m.id), 0) as applications_count,
        GROUP_CONCAT(DISTINCT s.name) as skills_list
      FROM missions m
      LEFT JOIN users u ON m.client_id = u.id
      LEFT JOIN mission_skills ms ON m.id = ms.mission_id
      LEFT JOIN skills s ON ms.skill_id = s.id
      ${whereClause}
      GROUP BY m.id
      ORDER BY m.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), parseInt(offset));
    const [missions] = await pool.execute(query, queryParams);

    const formattedMissions = missions.map(mission => ({
      id: mission.id.toString(),
      title: mission.title,
      description: mission.description,
      category: mission.category,
      budget: {
        min: mission.budget_min || 0,
        max: mission.budget_max || 0
      },
      deadline: mission.deadline,
      clientName: `${mission.first_name || 'Client'} ${mission.last_name || 'Anonyme'}`,
      clientAvatar: mission.client_avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
      publishedAt: mission.created_at,
      skills: mission.skills_list ? mission.skills_list.split(',') : [],
      applicationsCount: mission.applications_count || 0,
      status: mission.status,
      isUrgent: mission.is_urgent || false
    }));

    console.log(`✅ ${formattedMissions.length} missions récupérées`);

    res.json({
      success: true,
      missions: formattedMissions
    });

  } catch (error) {
    console.error('❌ Erreur récupération missions:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des missions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/missions - Créer une nouvelle mission
app.post('/api/missions', authMiddleware, async (req, res) => {
  let connection;
  
  try {
    console.log('📝 Création nouvelle mission par utilisateur:', req.user.id);
    console.log('📋 Données reçues:', req.body);
    
    const {
      title,
      description,
      category,
      budget,
      deadline,
      skills,
      isUrgent
    } = req.body;

    if (!title || !description || !category || !budget || !deadline) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs obligatoires doivent être remplis'
      });
    }

    if (!budget.min || !budget.max || budget.min <= 0 || budget.max <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Budget minimum et maximum requis et doivent être positifs'
      });
    }

    if (budget.min > budget.max) {
      return res.status(400).json({
        success: false,
        message: 'Le budget minimum ne peut pas être supérieur au maximum'
      });
    }

    const deadlineDate = new Date(deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (deadlineDate < today) {
      return res.status(400).json({
        success: false,
        message: 'La date limite ne peut pas être dans le passé'
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const [result] = await connection.execute(`
        INSERT INTO missions (
          title, description, category, budget_min, budget_max, 
          currency, deadline, client_id, status, is_remote, is_urgent,
          experience_level, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'EUR', ?, ?, 'open', 1, ?, 'intermediate', NOW(), NOW())
      `, [
        title.trim(),
        description.trim(),
        category,
        budget.min,
        budget.max,
        deadline,
        req.user.id,
        isUrgent || false
      ]);

      const missionId = result.insertId;
      console.log('✅ Mission créée avec ID:', missionId);

      if (skills && skills.length > 0) {
        await handleMissionSkills(skills, missionId, connection);
      }

      await connection.commit();
      
      const [newMission] = await pool.execute(`
        SELECT 
          m.*,
          u.first_name,
          u.last_name,
          u.email as client_email,
          u.avatar as client_avatar,
          GROUP_CONCAT(s.name) as skills_list
        FROM missions m
        LEFT JOIN users u ON m.client_id = u.id
        LEFT JOIN mission_skills ms ON m.id = ms.mission_id
        LEFT JOIN skills s ON ms.skill_id = s.id
        WHERE m.id = ?
        GROUP BY m.id
      `, [missionId]);

      const mission = newMission[0];
      const formattedMission = {
        id: mission.id.toString(),
        title: mission.title,
        description: mission.description,
        category: mission.category,
        budget: {
          min: mission.budget_min,
          max: mission.budget_max
        },
        deadline: mission.deadline,
        clientName: `${mission.first_name} ${mission.last_name}`,
        clientAvatar: mission.client_avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
        publishedAt: mission.created_at,
        skills: mission.skills_list ? mission.skills_list.split(',') : [],
        applicationsCount: 0,
        status: mission.status,
        isUrgent: mission.is_urgent || false
      };

      console.log('✅ Mission formatée pour réponse:', formattedMission.title);

      res.status(201).json({
        success: true,
        message: 'Mission créée avec succès',
        mission: formattedMission
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    }

  } catch (error) {
    console.error('❌ Erreur création mission:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la création de la mission',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// GET /api/missions/:id - Récupérer une mission spécifique
app.get('/api/missions/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔍 Récupération mission ID:', id);

    const [missions] = await pool.execute(`
      SELECT 
        m.*,
        u.first_name,
        u.last_name,
        u.email as client_email,
        u.phone as client_phone,
        u.avatar as client_avatar,
        u.bio as client_bio,
        u.location as client_location,
        u.created_at as client_member_since,
        COALESCE((SELECT COUNT(*) FROM applications WHERE mission_id = m.id), 0) as applications_count,
        GROUP_CONCAT(DISTINCT s.name) as skills_list
      FROM missions m
      LEFT JOIN users u ON m.client_id = u.id
      LEFT JOIN mission_skills ms ON m.id = ms.mission_id
      LEFT JOIN skills s ON ms.skill_id = s.id
      WHERE m.id = ?
      GROUP BY m.id
    `, [id]);

    if (missions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mission non trouvée'
      });
    }

    const mission = missions[0];
    
    const [clientStats] = await pool.execute(`
      SELECT 
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_projects,
        4.5 as average_rating
      FROM missions 
      WHERE client_id = ?
    `, [mission.client_id]);

    const formattedMission = {
      id: mission.id.toString(),
      title: mission.title,
      description: mission.description,
      longDescription: mission.description + '\n\nDescription détaillée de la mission avec plus d\'informations sur les attentes, les livrables et le contexte du projet.',
      category: mission.category,
      budget: {
        min: mission.budget_min || 0,
        max: mission.budget_max || 0
      },
      deadline: mission.deadline,
      client: {
        id: mission.client_id.toString(),
        name: `${mission.first_name || 'Client'} ${mission.last_name || 'Anonyme'}`,
        avatar: mission.client_avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
        rating: clientStats[0].average_rating || 4.5,
        completedProjects: clientStats[0].completed_projects || 0,
        memberSince: mission.client_member_since,
        verified: true
      },
      publishedAt: mission.created_at,
      skills: mission.skills_list ? mission.skills_list.split(',') : [],
      requirements: [
        'Expérience minimale de 2 ans dans le domaine',
        'Portfolio démontrant des projets similaires',
        'Capacité à respecter les délais',
        'Communication régulière pendant le projet'
      ],
      deliverables: [
        'Livrable principal selon les spécifications',
        'Documentation technique',
        'Fichiers sources',
        'Support post-livraison de 30 jours'
      ],
      applicationsCount: mission.applications_count || 0,
      status: mission.status,
      isUrgent: mission.is_urgent || false,
      attachments: []
    };

    console.log('✅ Mission détail récupérée:', formattedMission.title);

    res.json({
      success: true,
      data: formattedMission
    });

  } catch (error) {
    console.error('❌ Erreur récupération mission:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération de la mission'
    });
  }
});

// GET /api/missions/stats/overview - Statistiques
app.get('/api/missions/stats/overview', authMiddleware, async (req, res) => {
  try {
    const [stats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_missions,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_missions,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_missions,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_missions,
        COALESCE(AVG(CASE WHEN budget_max > 0 THEN budget_max ELSE budget_min END), 0) as average_budget
      FROM missions
    `);

    res.json({
      success: true,
      data: {
        ...stats[0],
        reported_missions: 0
      }
    });

  } catch (error) {
    console.error('❌ Erreur stats missions:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des statistiques'
    });
  }
});

// DELETE /api/missions/:id - Supprimer mission
app.delete('/api/missions/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🗑️ Suppression mission ID:', id);
    
    const [result] = await pool.execute('DELETE FROM missions WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mission non trouvée'
      });
    }

    console.log('✅ Mission supprimée avec succès');
    res.json({
      success: true,
      message: 'Mission supprimée avec succès'
    });

  } catch (error) {
    console.error('❌ Erreur suppression mission:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression'
    });
  }
});

// PATCH /api/missions/:id/status - Changer statut
app.patch('/api/missions/:id/status', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    console.log(`🔄 Changement statut mission ${id} vers: ${status}`);

    const validStatuses = ['open', 'assigned', 'in_progress', 'completed', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Statut invalide'
      });
    }

    const [result] = await pool.execute(
      'UPDATE missions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mission non trouvée'
      });
    }

    console.log('✅ Statut mission mis à jour');
    res.json({
      success: true,
      message: 'Statut mis à jour avec succès'
    });

  } catch (error) {
    console.error('❌ Erreur changement statut:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur'
    });
  }
});

// ✅ ======== ROUTES D'AUTHENTIFICATION ========

// Route de test
app.get('/', (req, res) => {
  res.json({
    message: 'API MATRIX - Backend fonctionnel',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// GET /api/health - Route de santé
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API MATRIX opérationnelle',
    timestamp: new Date().toISOString(),
    routes: {
      login: '/api/auth/login',
      register: '/api/auth/register',
      missions: '/api/missions',
      health: '/api/health'
    }
  });
});

// Route de test API - MISE À JOUR
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API MATRIX fonctionne',
    routes_disponibles: [
      'GET /api/test',
      'GET /api/health ✅',
      'POST /api/auth/login',
      'POST /api/auth/register ✅ NOUVEAU',
      'POST /api/auth/check-email ✅ NOUVEAU',
      'POST /api/auth/create-admin',
      '--- ROUTES MISSIONS ---',
      'GET /api/missions',
      'POST /api/missions',
      'GET /api/missions/:id',
      'DELETE /api/missions/:id',
      'PATCH /api/missions/:id/status',
      'GET /api/missions/stats/overview'
    ]
  });
});

// POST /api/auth/login - Connexion
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('🔐 === LOGIN MATRIX ===');
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Email et mot de passe requis' 
      });
    }
    
    console.log('🔍 Tentative login:', email);
    
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE email = ? AND is_active = 1',
      [email]
    );
    
    if (users.length === 0) {
      console.log('❌ Utilisateur non trouvé');
      return res.status(401).json({ 
        success: false,
        error: 'Email ou mot de passe incorrect' 
      });
    }
    
    const user = users[0];
    console.log('✅ Utilisateur trouvé:', user.email);
    
    const passwordValid = await bcrypt.compare(password, user.password);
    
    if (!passwordValid) {
      console.log('❌ Mot de passe incorrect');
      return res.status(401).json({ 
        success: false,
        error: 'Email ou mot de passe incorrect' 
      });
    }
    
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        user_type: user.user_type,
        first_name: user.first_name,
        last_name: user.last_name
      },
      process.env.JWT_SECRET || 'matrix-secret-key',
      { expiresIn: '24h' }
    );
    
    console.log('✅ Login réussi pour:', user.email);
    
    res.json({
      success: true,
      message: 'Connexion réussie',
      token: token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        user_type: user.user_type,
        avatar: user.avatar,
        is_active: user.is_active
      }
    });
    
  } catch (error) {
    console.error('❌ Erreur login:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur' 
    });
  }
});

// ✅ POST /api/auth/register - NOUVELLE ROUTE D'INSCRIPTION
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('📝 === INSCRIPTION MATRIX ===');
    
    const { 
      email, 
      password, 
      user_type, 
      first_name, 
      last_name,
      phone,
      location,
      bio 
    } = req.body;
    
    console.log('📝 Tentative inscription:', { email, user_type, first_name, last_name });
    
    // Validation des champs obligatoires
    if (!email || !password || !user_type || !first_name || !last_name) {
      return res.status(400).json({ 
        success: false,
        error: 'Tous les champs obligatoires doivent être remplis' 
      });
    }
    
    // Validation du type d'utilisateur
    if (!['freelance', 'client'].includes(user_type)) {
      return res.status(400).json({ 
        success: false,
        error: 'Type d\'utilisateur invalide' 
      });
    }
    
    // Validation de l'email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false,
        error: 'Format d\'email invalide' 
      });
    }
    
    // Validation du mot de passe
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false,
        error: 'Le mot de passe doit contenir au moins 6 caractères' 
      });
    }
    
    // Vérifier si l'utilisateur existe déjà
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    
    if (existingUsers.length > 0) {
      console.log('❌ Email déjà utilisé:', email);
      return res.status(409).json({ 
        success: false,
        error: 'Un compte existe déjà avec cette adresse email' 
      });
    }
    
    // Hash du mot de passe
    console.log('🔐 Hachage du mot de passe...');
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Utiliser une transaction pour assurer la cohérence
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // Créer l'utilisateur
      const [userResult] = await connection.execute(`
        INSERT INTO users (
          email, password, user_type, first_name, last_name,
          phone, location, bio, is_active, email_verified, 
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, FALSE, NOW(), NOW())
      `, [
        email, 
        hashedPassword, 
        user_type, 
        first_name, 
        last_name,
        phone || null,
        location || null,
        bio || null
      ]);
      
      const userId = userResult.insertId;
      console.log('✅ Utilisateur créé avec ID:', userId);
      
      // Si c'est un freelance, créer son profil
      if (user_type === 'freelance') {
        await connection.execute(`
          INSERT INTO freelance_profiles (
            user_id, hourly_rate, availability, experience_years, 
            completed_missions, average_rating, total_earnings, response_time_hours
          ) VALUES (?, 0, TRUE, 0, 0, 0, 0, 24)
        `, [userId]);
        
        console.log('✅ Profil freelance créé pour utilisateur:', userId);
      }
      
      await connection.commit();
      connection.release();
      
      // Générer le token JWT
      const token = jwt.sign(
        {
          id: userId,
          email: email,
          user_type: user_type,
          first_name: first_name,
          last_name: last_name
        },
        process.env.JWT_SECRET || 'matrix-secret-key',
        { expiresIn: '24h' }
      );
      
      console.log('✅ Inscription réussie pour:', email);
      
      // Récupérer les données complètes de l'utilisateur
      const [newUser] = await pool.execute(`
        SELECT 
          u.id, u.email, u.user_type, u.first_name, u.last_name, 
          u.avatar, u.bio, u.location, u.phone, u.website, u.is_active,
          fp.hourly_rate, fp.availability, fp.experience_years, 
          fp.completed_missions, fp.average_rating, fp.total_earnings, fp.response_time_hours
        FROM users u
        LEFT JOIN freelance_profiles fp ON u.id = fp.user_id
        WHERE u.id = ?
      `, [userId]);
      
      const user = newUser[0];
      
      // Formatter la réponse selon le format attendu par le frontend
      const userResponse = {
        id: user.id,
        email: user.email,
        user_type: user.user_type,
        first_name: user.first_name,
        last_name: user.last_name,
        avatar: user.avatar,
        bio: user.bio,
        location: user.location,
        phone: user.phone,
        website: user.website
      };
      
      // Ajouter le profil freelance si applicable
      if (user.user_type === 'freelance' && user.hourly_rate !== undefined) {
        userResponse.freelance_profile = {
          hourly_rate: user.hourly_rate || 0,
          availability: user.availability || true,
          experience_years: user.experience_years || 0,
          completed_missions: user.completed_missions || 0,
          average_rating: user.average_rating || 0,
          total_earnings: user.total_earnings || 0,
          response_time_hours: user.response_time_hours || 24
        };
      }
      
      res.status(201).json({
        success: true,
        message: 'Inscription réussie',
        token: token,
        user: userResponse
      });
      
    } catch (dbError) {
      await connection.rollback();
      connection.release();
      throw dbError;
    }
    
  } catch (error) {
    console.error('❌ Erreur inscription:', error);
    
    let errorMessage = 'Erreur lors de l\'inscription';
    
    if (error.code === 'ER_DUP_ENTRY') {
      errorMessage = 'Un compte existe déjà avec cette adresse email';
    } else if (error.code === 'ER_DATA_TOO_LONG') {
      errorMessage = 'Une des données fournies est trop longue';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({ 
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ POST /api/auth/check-email - Vérifier si un email existe
app.post('/api/auth/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false,
        error: 'Email requis' 
      });
    }
    
    const [users] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    
    res.json({
      success: true,
      exists: users.length > 0
    });
    
  } catch (error) {
    console.error('❌ Erreur vérification email:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur' 
    });
  }
});

// POST /api/auth/create-admin - Créer un admin
app.post('/api/auth/create-admin', async (req, res) => {
  try {
    console.log('👑 === CRÉATION ADMIN MATRIX ===');
    
    const { email, password, first_name, last_name } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Email et mot de passe requis' 
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    
    if (existing.length > 0) {
      await pool.execute(
        'UPDATE users SET user_type = ?, password = ?, updated_at = NOW() WHERE email = ?',
        ['admin', hashedPassword, email]
      );
      console.log('✅ Utilisateur existant mis à jour en admin');
    } else {
      await pool.execute(`
        INSERT INTO users (
          first_name, last_name, email, password, user_type,
          is_active, email_verified, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'admin', 1, 1, NOW(), NOW())
      `, [first_name, last_name, email, hashedPassword]);
      
      console.log('✅ Nouvel admin créé');
    }
    
    res.json({ 
      success: true,
      message: 'Admin créé/mis à jour avec succès',
      email: email
    });
    
  } catch (error) {
    console.error('❌ Erreur création admin:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur création admin',
      details: error.message
    });
  }
});
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

// ✅ ======== ROUTES FREELANCE PROFILE COMPLÈTES ========

// GET /api/freelance-profile - Récupérer le profil du freelance connecté
app.get('/api/freelance-profile', authMiddleware, requireFreelance, async (req, res) => {
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

    // Récupérer les projets portfolio - Version sécurisée avec vérification de table
    let projects = [];
    try {
      const [projectResults] = await pool.execute(`
        SELECT 
          pp.id, pp.title, pp.description, pp.image_url, pp.project_url,
          pp.technologies, pp.created_at
        FROM portfolio_projects pp
        WHERE pp.freelance_id = ?
        ORDER BY pp.created_at DESC
      `, [req.user.id]);
      projects = projectResults;
    } catch (portfolioError) {
      console.log('⚠️ Table portfolio_projects non trouvée, portfolio vide');
      projects = [];
    }

    const formattedProfile = {
      id: profile.id,
      userId: profile.id,
      fullName: `${profile.first_name} ${profile.last_name}`,
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

// PUT /api/freelance-profile - Mettre à jour le profil freelance
app.put('/api/freelance-profile', authMiddleware, requireFreelance, async (req, res) => {
  let connection;
  
  try {
    console.log('📝 Mise à jour profil freelance pour utilisateur:', req.user.id);

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

    // Validation
    if (!fullName || !title || !bio) {
      return res.status(400).json({
        success: false,
        message: 'Nom complet, titre et bio sont requis'
      });
    }

    if (hourlyRate && hourlyRate < 0) {
      return res.status(400).json({
        success: false,
        message: 'Le tarif horaire ne peut pas être négatif'
      });
    }

    if (experienceYears && experienceYears < 0) {
      return res.status(400).json({
        success: false,
        message: 'Les années d\'expérience ne peuvent pas être négatives'
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Séparer le nom complet
      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || firstName;

      // Mettre à jour la table users
      await connection.execute(`
        UPDATE users 
        SET first_name = ?, last_name = ?, bio = ?
        WHERE id = ?
      `, [firstName, lastName, bio, req.user.id]);

      // Mettre à jour le profil freelance
      await connection.execute(`
        INSERT INTO freelance_profiles 
        (user_id, hourly_rate, availability, experience_years, response_time_hours)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        hourly_rate = VALUES(hourly_rate),
        availability = VALUES(availability),
        experience_years = VALUES(experience_years),
        response_time_hours = VALUES(response_time_hours)
      `, [
        req.user.id,
        hourlyRate || 0,
        availability !== undefined ? availability : true,
        experienceYears || 0,
        responseTimeHours || 24
      ]);

      // Mettre à jour les compétences
      if (skills && Array.isArray(skills)) {
        // Supprimer les anciennes compétences
        await connection.execute(
          'DELETE FROM user_skills WHERE user_id = ?',
          [req.user.id]
        );

        // Ajouter les nouvelles compétences
        for (const skill of skills) {
          if (skill.name && skill.name.trim()) {
            // Vérifier si la compétence existe
            let [existingSkills] = await connection.execute(
              'SELECT id FROM skills WHERE LOWER(name) = LOWER(?)',
              [skill.name.trim()]
            );

            let skillId;
            if (existingSkills.length > 0) {
              skillId = existingSkills[0].id;
            } else {
              // Créer la nouvelle compétence
              const [insertResult] = await connection.execute(
                'INSERT INTO skills (name, category) VALUES (?, ?)',
                [skill.name.trim(), 'général']
              );
              skillId = insertResult.insertId;
            }

            // Associer la compétence à l'utilisateur
            const proficiency = ['debutant', 'intermediaire', 'avance', 'expert'].includes(skill.level) 
              ? skill.level : 'intermediaire';

            await connection.execute(
              'INSERT INTO user_skills (user_id, skill_id, proficiency) VALUES (?, ?, ?)',
              [req.user.id, skillId, proficiency]
            );
          }
        }
      }

      await connection.commit();
      console.log('✅ Profil freelance mis à jour avec succès');

      res.json({
        success: true,
        message: 'Profil mis à jour avec succès'
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    }

  } catch (error) {
    console.error('❌ Erreur mise à jour profil:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour du profil',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// GET /api/freelance-profile/stats - Statistiques du freelance
app.get('/api/freelance-profile/stats', authMiddleware, requireFreelance, async (req, res) => {
  try {
    console.log('📊 Récupération stats freelance pour:', req.user.id);

    const [stats] = await pool.execute(`
      SELECT 
        COALESCE(fp.completed_missions, 0) as completed_missions,
        COALESCE(fp.average_rating, 0) as average_rating,
        COALESCE(fp.total_earnings, 0) as total_earnings,
        COALESCE(fp.response_time_hours, 24) as response_time_hours,
        (SELECT COUNT(*) FROM applications WHERE freelance_id = ? AND status = 'pending') as pending_applications,
        (SELECT COUNT(*) FROM missions WHERE assigned_freelance_id = ? AND status = 'in_progress') as active_missions
      FROM freelance_profiles fp
      WHERE fp.user_id = ?
      UNION ALL
      SELECT 0, 0, 0, 24, 0, 0
      LIMIT 1
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

// POST /api/freelance-profile/portfolio - Ajouter un projet au portfolio
app.post('/api/freelance-profile/portfolio', authMiddleware, requireFreelance, async (req, res) => {
  try {
    console.log('📁 Ajout projet portfolio pour:', req.user.id);

    const { title, description, imageUrl, projectUrl, technologies } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: 'Titre et description requis'
      });
    }

    // Vérifier si la table portfolio_projects existe
    try {
      const [result] = await pool.execute(`
        INSERT INTO portfolio_projects 
        (freelance_id, title, description, image_url, project_url, technologies)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        req.user.id,
        title.trim(),
        description.trim(),
        imageUrl || null,
        projectUrl || null,
        technologies ? JSON.stringify(technologies) : null
      ]);

      const projectId = result.insertId;

      res.json({
        success: true,
        message: 'Projet ajouté au portfolio avec succès',
        project: {
          id: projectId.toString(),
          title,
          description,
          imageUrl: imageUrl || 'https://via.placeholder.com/300x200',
          projectUrl: projectUrl || '',
          technologies: technologies || [],
          createdAt: new Date()
        }
      });
    } catch (tableError) {
      console.log('⚠️ Table portfolio_projects non trouvée, création simulée');
      res.json({
        success: true,
        message: 'Projet ajouté (table portfolio_projects à créer)',
        project: {
          id: '1',
          title,
          description,
          imageUrl: imageUrl || 'https://via.placeholder.com/300x200',
          projectUrl: projectUrl || '',
          technologies: technologies || [],
          createdAt: new Date()
        }
      });
    }

  } catch (error) {
    console.error('❌ Erreur ajout portfolio:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'ajout du projet'
    });
  }
});

// PUT /api/freelance-profile/portfolio/:id - Mettre à jour un projet
app.put('/api/freelance-profile/portfolio/:id', authMiddleware, requireFreelance, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, imageUrl, projectUrl, technologies } = req.body;

    console.log('📝 Mise à jour projet portfolio:', id);

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: 'Titre et description requis'
      });
    }

    try {
      const [result] = await pool.execute(`
        UPDATE portfolio_projects 
        SET title = ?, description = ?, image_url = ?, project_url = ?, 
            technologies = ?
        WHERE id = ? AND freelance_id = ?
      `, [
        title.trim(),
        description.trim(),
        imageUrl || null,
        projectUrl || null,
        technologies ? JSON.stringify(technologies) : null,
        id,
        req.user.id
      ]);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Projet non trouvé ou non autorisé'
        });
      }

      res.json({
        success: true,
        message: 'Projet mis à jour avec succès'
      });
    } catch (tableError) {
      console.log('⚠️ Table portfolio_projects non trouvée');
      res.json({
        success: true,
        message: 'Projet mis à jour (table portfolio_projects à créer)'
      });
    }

  } catch (error) {
    console.error('❌ Erreur mise à jour portfolio:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour'
    });
  }
});

// DELETE /api/freelance-profile/portfolio/:id - Supprimer un projet du portfolio
app.delete('/api/freelance-profile/portfolio/:id', authMiddleware, requireFreelance, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🗑️ Suppression projet portfolio:', id);

    try {
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

      res.json({
        success: true,
        message: 'Projet supprimé du portfolio avec succès'
      });
    } catch (tableError) {
      console.log('⚠️ Table portfolio_projects non trouvée');
      res.json({
        success: true,
        message: 'Projet supprimé (table portfolio_projects à créer)'
      });
    }

  } catch (error) {
    console.error('❌ Erreur suppression portfolio:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression'
    });
  }
});

// DELETE /api/freelance-profile/skills/:skillId - Supprimer une compétence
app.delete('/api/freelance-profile/skills/:skillId', authMiddleware, requireFreelance, async (req, res) => {
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
// ✅ ROUTES UTILISATEURS - Chargement sécurisé
try {
  const usersRoutes = require('./routes/users');
  app.use('/api/users', usersRoutes);
  console.log('✅ Routes users chargées avec succès');
} catch (error) {
  console.error('❌ Erreur chargement routes users:', error.message);
  console.log('⚠️ Routes users non disponibles');
}

// Middleware de gestion des erreurs
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err.stack);
  res.status(500).json({
    error: 'Erreur interne du serveur',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Une erreur est survenue'
  });
});

// Route 404
app.use((req, res) => {
  res.status(404).json({
    error: 'Route non trouvée',
    path: req.originalUrl,
    method: req.method,
    available_routes: [
      'GET /',
      'GET /api/health',
      'GET /api/test',
      'POST /api/auth/login',
      'POST /api/auth/register',
      'POST /api/auth/check-email',
      'POST /api/auth/create-admin',
      'GET /api/missions',
      'POST /api/missions',
      'GET /api/missions/:id',
      'DELETE /api/missions/:id',
      'PATCH /api/missions/:id/status',
      'GET /api/missions/stats/overview'
    ]
  });
});

// Démarrage du serveur
async function startServer() {
  try {
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('Impossible de se connecter à la base de données');
      console.log('Assurez-vous que :');
      console.log(' - MySQL est démarré');
      console.log(' - Les paramètres dans .env sont corrects');
      console.log(' - La base de données existe (npm run init-db)');
      process.exit(1);
    }

    app.listen(PORT, () => {
      console.log('================================');
      console.log(`✅ Serveur MATRIX démarré !`);
      console.log(`Port: ${PORT}`);
      console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
      console.log(`API: http://localhost:${PORT}`);
      console.log(`Base de données: ${process.env.DB_NAME}`);
      console.log('Routes disponibles:');
      console.log('  📍 ROUTES DE TEST:');
      console.log('    - GET  /');
      console.log('    - GET  /api/test');
      console.log('    - GET  /api/health ✅');
      console.log('  🔐 ROUTES D\'AUTHENTIFICATION:');
      console.log('    - POST /api/auth/login');
      console.log('    - POST /api/auth/register ✅ NOUVEAU');
      console.log('    - POST /api/auth/check-email ✅ NOUVEAU');
      console.log('    - POST /api/auth/create-admin');
      console.log('  📋 ROUTES MISSIONS:');
      console.log('    - GET  /api/missions');
      console.log('    - POST /api/missions');
      console.log('    - GET  /api/missions/:id');
      console.log('    - DELETE /api/missions/:id');
      console.log('    - PATCH /api/missions/:id/status');
      console.log('    - GET  /api/missions/stats/overview');
      console.log('================================');
      console.log('🎯 Testez l\'inscription avec:');
      console.log(`   curl -X POST http://localhost:${PORT}/api/auth/register \\`);
      console.log('     -H "Content-Type: application/json" \\');
      console.log('     -d \'{"email":"test@example.com","password":"password123","user_type":"client","first_name":"Test","last_name":"User"}\'');
      console.log('🎯 Testez la connexion avec:');
      console.log(`   curl -X POST http://localhost:${PORT}/api/auth/login \\`);
      console.log('     -H "Content-Type: application/json" \\');
      console.log('     -d \'{"email":"hissein@gmail.com","password":"client123"}\'');
      console.log('💡 Testez les missions avec:');
      console.log(`   curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:${PORT}/api/missions`);
      console.log('🔍 Testez la santé du serveur:');
      console.log(`   curl http://localhost:${PORT}/api/health`);
      console.log('================================');
    });
  } catch (error) {
    console.error('Erreur lors du démarrage du serveur:', error);
    process.exit(1);
  }
}

// Gestion propre de l'arrêt du serveur
process.on('SIGINT', () => {
  console.log('\nArrêt du serveur...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nArrêt du serveur...');
  process.exit(0);
});

startServer();