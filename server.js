// server.js - VERSION COMPLÈTE CORRIGÉE
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
        // Créer un nouveau skill - AVEC created_at corrigé
        try {
          const [insertResult] = await connection.execute(
            'INSERT INTO skills (name, category, created_at) VALUES (?, ?, NOW())',
            [trimmedSkill, 'général'] // Catégorie par défaut
          );
          skillId = insertResult.insertId;
          console.log(`✅ Nouveau skill créé: ${trimmedSkill} (ID: ${skillId})`);
        } catch (insertError) {
          console.error(`❌ Erreur insertion skill ${trimmedSkill}:`, insertError);
          // Si erreur d'insertion, essayer de récupérer le skill (peut-être créé entre temps)
          const [retrySkills] = await connection.execute(
            'SELECT id FROM skills WHERE LOWER(name) = LOWER(?)',
            [trimmedSkill]
          );
          if (retrySkills.length > 0) {
            skillId = retrySkills[0].id;
            console.log(`✅ Skill récupéré après erreur: ${trimmedSkill} (ID: ${skillId})`);
          } else {
            console.error(`❌ Impossible de créer/récupérer skill: ${trimmedSkill}`);
            continue; // Passer au skill suivant
          }
        }
      }
      
      if (skillId) {
        skillIds.push(skillId);
        
        // Associer le skill à la mission
        try {
          await connection.execute(
            'INSERT IGNORE INTO mission_skills (mission_id, skill_id, created_at) VALUES (?, ?, NOW())',
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

// ✅ ======== ROUTES MISSIONS COMPLÈTES CORRIGÉES ========

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

    // Requête principale avec informations client et compétences
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

    // Formatage des missions pour le frontend
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
      missions: formattedMissions // ✅ Format attendu par le frontend
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

// POST /api/missions - Créer une nouvelle mission ✅ CORRIGÉE
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

    // Validation des champs obligatoires
    if (!title || !description || !category || !budget || !deadline) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs obligatoires doivent être remplis'
      });
    }

    // Validation du budget
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

    // Validation de la date
    const deadlineDate = new Date(deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (deadlineDate < today) {
      return res.status(400).json({
        success: false,
        message: 'La date limite ne peut pas être dans le passé'
      });
    }

    // Utiliser une transaction pour assurer la cohérence
    connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Insertion de la mission
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

      // Gestion des compétences avec la fonction corrigée
      if (skills && skills.length > 0) {
        await handleMissionSkills(skills, missionId, connection);
      }

      await connection.commit();
      
      // Récupérer la mission complète pour la réponse
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
        mission: formattedMission // ✅ Format attendu par le frontend
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
    
    // Calcul des statistiques client
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

// GET /api/health - Route de santé pour tester la connexion
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API MATRIX opérationnelle',
    timestamp: new Date().toISOString()
  });
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

// Route de test API
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API MATRIX fonctionne',
    routes_disponibles: [
      'GET /api/test',
      'GET /api/health',
      'POST /api/auth/login',
      'POST /api/auth/create-admin',
      'GET /api/users/health',
      '--- ROUTES MISSIONS CORRIGÉES ---',
      'GET /api/missions',
      'POST /api/missions ✅ CORRIGÉE',
      'GET /api/missions/:id',
      'DELETE /api/missions/:id',
      'PATCH /api/missions/:id/status',
      'GET /api/missions/stats/overview'
    ]
  });
});

// Route login principale
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('🔐 === LOGIN MATRIX ===');
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }
    
    console.log('🔍 Tentative login:', email);
    
    // Chercher l'utilisateur
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE email = ? AND is_active = 1',
      [email]
    );
    
    if (users.length === 0) {
      console.log('❌ Utilisateur non trouvé');
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    
    const user = users[0];
    console.log('✅ Utilisateur trouvé:', user.email);
    
    // Vérifier le mot de passe
    const passwordValid = await bcrypt.compare(password, user.password);
    
    if (!passwordValid) {
      console.log('❌ Mot de passe incorrect');
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    
    // Générer le token
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
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route pour créer un admin
app.post('/api/auth/create-admin', async (req, res) => {
  try {
    console.log('👑 === CRÉATION ADMIN MATRIX ===');
    
    const { email, password, first_name, last_name } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }
    
    // Hash du mot de passe
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Vérifier si l'utilisateur existe
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    
    if (existing.length > 0) {
      // Mettre à jour utilisateur existant
      await pool.execute(
        'UPDATE users SET user_type = ?, password = ?, updated_at = NOW() WHERE email = ?',
        ['admin', hashedPassword, email]
      );
      console.log('✅ Utilisateur existant mis à jour en admin');
    } else {
      // Créer nouvel admin
      await pool.execute(`
        INSERT INTO users (
          first_name, last_name, email, password, user_type,
          is_active, email_verified, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'admin', 1, 1, NOW(), NOW())
      `, [first_name, last_name, email, hashedPassword]);
      
      console.log('✅ Nouvel admin créé');
    }
    
    res.json({ 
      message: 'Admin créé/mis à jour avec succès',
      email: email
    });
    
  } catch (error) {
    console.error('❌ Erreur création admin:', error);
    res.status(500).json({ 
      error: 'Erreur création admin',
      details: error.message
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
    method: req.method
  });
});

// Démarrage du serveur
async function startServer() {
  try {
    // Tester la connexion à la base de données
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
      console.log('    - GET  /api/test');
      console.log('    - GET  /api/health ✅ NOUVEAU');
      console.log('  🔐 ROUTES D\'AUTHENTIFICATION:');
      console.log('    - POST /api/auth/login');
      console.log('    - POST /api/auth/create-admin');
      console.log('  📋 ROUTES MISSIONS CORRIGÉES:');
      console.log('    - GET  /api/missions ✅ CORRIGÉE');
      console.log('    - POST /api/missions ✅ SKILLS CORRIGÉS');
      console.log('    - GET  /api/missions/:id');
      console.log('    - DELETE /api/missions/:id');
      console.log('    - PATCH /api/missions/:id/status');
      console.log('    - GET  /api/missions/stats/overview');
      console.log('================================');
      console.log('🎯 Testez le login avec:');
      console.log(`   curl -X POST http://localhost:${PORT}/api/auth/login \\`);
      console.log('     -H "Content-Type: application/json" \\');
      console.log('     -d \'{"email": "hissein@gmail.com", "password": "client123"}\'');
      console.log('💡 Testez les missions avec:');
      console.log(`   curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:${PORT}/api/missions`);
      console.log('🆕 Testez création mission avec:');
      console.log(`   curl -X POST http://localhost:${PORT}/api/missions \\`);
      console.log('     -H "Authorization: Bearer YOUR_TOKEN" \\');
      console.log('     -H "Content-Type: application/json" \\');
      console.log('     -d \'{"title":"Test Mission","description":"Description test","category":"Design","budget":{"min":500,"max":1000},"deadline":"2025-07-01","skills":["CSS","JavaScript"],"isUrgent":false}\'');
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