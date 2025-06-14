// server.js - VERSION AVEC MISSIONS INTÉGRÉES (GARDE VOTRE CODE USERS)
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

// ✅ CRÉATION AUTOMATIQUE DES TABLES MISSIONS AU DÉMARRAGE
async function createMissionTablesIfNeeded() {
  try {
    console.log('🔧 Vérification tables missions...');
    
    // Vérifier si la table missions existe
    const [missionTableCheck] = await pool.execute("SHOW TABLES LIKE 'missions'");
    
    if (missionTableCheck.length === 0) {
      console.log('📋 Création tables missions...');
      
      // Table missions
      await pool.execute(`
        CREATE TABLE missions (
          id INT PRIMARY KEY AUTO_INCREMENT,
          title VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          category VARCHAR(100) NOT NULL,
          budget_min DECIMAL(10,2),
          budget_max DECIMAL(10,2),
          budget_type ENUM('fixed', 'hourly') DEFAULT 'fixed',
          currency VARCHAR(3) DEFAULT 'EUR',
          deadline DATE,
          client_id INT NOT NULL,
          assigned_freelance_id INT NULL,
          status ENUM('open', 'assigned', 'in_progress', 'completed', 'cancelled') DEFAULT 'open',
          is_remote BOOLEAN DEFAULT TRUE,
          location VARCHAR(255),
          experience_level ENUM('beginner', 'intermediate', 'expert') DEFAULT 'intermediate',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (assigned_freelance_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB
      `);
      
      // Table skills
      await pool.execute(`
        CREATE TABLE skills (
          id INT PRIMARY KEY AUTO_INCREMENT,
          name VARCHAR(100) UNIQUE NOT NULL,
          category VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB
      `);
      
      // Table mission_skills
      await pool.execute(`
        CREATE TABLE mission_skills (
          mission_id INT,
          skill_id INT,
          PRIMARY KEY (mission_id, skill_id),
          FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
          FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
      `);
      
      // Table applications
      await pool.execute(`
        CREATE TABLE applications (
          id INT PRIMARY KEY AUTO_INCREMENT,
          mission_id INT NOT NULL,
          freelance_id INT NOT NULL,
          proposal TEXT NOT NULL,
          proposed_budget DECIMAL(10,2),
          proposed_deadline DATE,
          status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          responded_at TIMESTAMP NULL,
          FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
          FOREIGN KEY (freelance_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE KEY unique_application (mission_id, freelance_id)
        ) ENGINE=InnoDB
      `);
      
      // Table mission_reports
      await pool.execute(`
        CREATE TABLE mission_reports (
          id INT PRIMARY KEY AUTO_INCREMENT,
          mission_id INT NOT NULL,
          reporter_id INT NOT NULL,
          reason TEXT NOT NULL,
          status ENUM('pending', 'reviewed', 'resolved') DEFAULT 'pending',
          admin_notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
          FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
      `);
      
      console.log('✅ Tables missions créées');
      
      // Créer des données de test
      await createMissionTestData();
    } else {
      console.log('✅ Tables missions déjà présentes');
    }
    
  } catch (error) {
    console.error('❌ Erreur création tables missions:', error);
  }
}

// ✅ CRÉATION DE DONNÉES DE TEST MISSIONS
async function createMissionTestData() {
  try {
    console.log('📝 Création données test missions...');
    
    // Récupérer ou créer un utilisateur client
    let [clients] = await pool.execute("SELECT id FROM users WHERE user_type = 'client' LIMIT 1");
    let clientId;
    
    if (clients.length === 0) {
      const hashedPassword = await bcrypt.hash('client123', 12);
      const [result] = await pool.execute(`
        INSERT INTO users (first_name, last_name, email, password, user_type, is_active, email_verified, created_at, updated_at) 
        VALUES ('Client', 'Test', 'client@matrix.com', ?, 'client', 1, 1, NOW(), NOW())
      `, [hashedPassword]);
      clientId = result.insertId;
      console.log('✅ Client test créé');
    } else {
      clientId = clients[0].id;
    }
    
    // Ajouter compétences de base
    const skills = [
      ['JavaScript', 'Développement'],
      ['React', 'Développement'],
      ['Node.js', 'Développement'],
      ['Angular', 'Développement'],
      ['UI/UX Design', 'Design'],
      ['Photoshop', 'Design']
    ];
    
    for (const [name, category] of skills) {
      await pool.execute('INSERT IGNORE INTO skills (name, category) VALUES (?, ?)', [name, category]);
    }
    
    // Vérifier si des missions existent déjà
    const [missionCount] = await pool.execute('SELECT COUNT(*) as count FROM missions');
    
    if (missionCount[0].count === 0) {
      // Créer 3 missions de test
      const missions = [
        {
          title: 'Développement site web vitrine',
          description: 'Création d\'un site web moderne et responsive pour une entreprise.',
          category: 'Développement',
          budget_min: 1500,
          budget_max: 2500,
          deadline: '2024-07-15'
        },
        {
          title: 'Design logo et identité visuelle',
          description: 'Création d\'un logo professionnel et de l\'identité visuelle complète.',
          category: 'Design',
          budget_min: 800,
          budget_max: 1200,
          deadline: '2024-06-30'
        },
        {
          title: 'Application mobile e-commerce',
          description: 'Développement d\'une application mobile complète pour la vente en ligne.',
          category: 'Développement',
          budget_min: 3000,
          budget_max: 5000,
          deadline: '2024-08-30'
        }
      ];
      
      for (const mission of missions) {
        await pool.execute(`
          INSERT INTO missions (title, description, category, budget_min, budget_max, currency, deadline, client_id, status, is_remote, experience_level) 
          VALUES (?, ?, ?, ?, ?, 'EUR', ?, ?, 'open', 1, 'intermediate')
        `, [mission.title, mission.description, mission.category, mission.budget_min, mission.budget_max, mission.deadline, clientId]);
      }
      
      console.log('✅ 3 missions de test créées');
    }
    
  } catch (error) {
    console.error('❌ Erreur création données test:', error);
  }
}

// ✅ MIDDLEWARE D'AUTHENTIFICATION (pour les nouvelles routes missions)
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
    res.status(500).json({
      success: false,
      message: 'Erreur serveur d\'authentification.'
    });
  }
};

// ✅ FONCTION HELPER
function calculateEstimatedDuration(deadline) {
  if (!deadline) return null;
  
  const now = new Date();
  const deadlineDate = new Date(deadline);
  const diffTime = deadlineDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return 'Échue';
  if (diffDays === 0) return 'Aujourd\'hui';
  if (diffDays === 1) return '1 jour';
  if (diffDays < 7) return `${diffDays} jours`;
  if (diffDays < 30) return `${Math.ceil(diffDays / 7)} semaines`;
  return `${Math.ceil(diffDays / 30)} mois`;
}

// ✅ ======== NOUVELLES ROUTES MISSIONS ========

// GET /api/missions - Liste des missions
app.get('/api/missions', authMiddleware, async (req, res) => {
  try {
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

    // Compter le total
    const countQuery = `SELECT COUNT(*) as total FROM missions m ${whereClause}`;
    const [countResult] = await pool.execute(countQuery, queryParams);
    const totalItems = countResult[0].total;

    // Requête principale
    const query = `
      SELECT 
        m.*,
        u.first_name,
        u.last_name,
        u.email as client_email,
        COALESCE((SELECT COUNT(*) FROM applications WHERE mission_id = m.id), 0) as applications_count
      FROM missions m
      LEFT JOIN users u ON m.client_id = u.id
      ${whereClause}
      ORDER BY m.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), parseInt(offset));
    const [missions] = await pool.execute(query, queryParams);

    // Formatage
    const formattedMissions = missions.map(mission => ({
      id: mission.id.toString(),
      title: mission.title,
      description: mission.description,
      budget: mission.budget_max || mission.budget_min || 0,
      currency: mission.currency || 'EUR',
      status: mission.status,
      category: mission.category,
      clientId: mission.client_id.toString(),
      clientName: `${mission.first_name} ${mission.last_name}`,
      clientEmail: mission.client_email,
      skillsRequired: [],
      createdAt: mission.created_at,
      updatedAt: mission.updated_at,
      publishedAt: mission.created_at,
      deadline: mission.deadline,
      applicationsCount: mission.applications_count,
      isReported: false,
      priority: mission.experience_level || 'medium',
      estimatedDuration: mission.deadline ? calculateEstimatedDuration(mission.deadline) : null
    }));

    res.json({
      success: true,
      data: {
        missions: formattedMissions,
        pagination: {
          currentPage: parseInt(page),
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Erreur récupération missions:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des missions'
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
    const [result] = await pool.execute('DELETE FROM missions WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mission non trouvée'
      });
    }

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

// ✅ ======== VOTRE CODE USERS EXISTANT (GARDÉ TEL QUEL) ========

// Route de test
app.get('/', (req, res) => {
  res.json({
    message: 'API MATRIX - Backend fonctionnel',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ✅ Route de test API
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API MATRIX fonctionne',
    routes_disponibles: [
      'GET /api/test',
      'POST /api/auth/login',
      'POST /api/auth/create-admin',
      'GET /api/users/health',
      'GET /api/users',
      'GET /api/users/stats',
      'POST /api/users',
      'PUT /api/users/:id',
      'PUT /api/users/:id/status',
      'DELETE /api/users/:id',
      'POST /api/users/bulk-action',
      '--- NOUVELLES ROUTES MISSIONS ---',
      'GET /api/missions',
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

// Route de debug table
app.get('/api/auth/debug-table', async (req, res) => {
  try {
    console.log('🔍 === DEBUG TABLE STRUCTURE ===');
    
    const [structure] = await pool.execute('DESCRIBE users');
    const [users] = await pool.execute('SELECT id, email, user_type, first_name, last_name, is_active FROM users LIMIT 5');
    
    res.json({
      message: 'Structure de la table users',
      structure: structure,
      sample_users: users,
      column_names: structure.map(col => col.Field)
    });
    
  } catch (error) {
    console.error('❌ Erreur debug table:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour générer un token admin rapide
app.post('/api/auth/quick-admin-token', async (req, res) => {
  try {
    const token = jwt.sign(
      {
        id: 1,
        email: 'admin@matrix.com',
        user_type: 'admin',
        first_name: 'Admin',
        last_name: 'MATRIX'
      },
      process.env.JWT_SECRET || 'matrix-secret-key',
      { expiresIn: '24h' }
    );
    
    res.json({
      message: 'Token admin généré pour test',
      token: token,
      user: {
        id: 1,
        email: 'admin@matrix.com',
        user_type: 'admin',
        first_name: 'Admin',
        last_name: 'MATRIX'
      },
      instructions: 'Utilisez ce token dans localStorage'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ ROUTES UTILISATEURS - Chargement sécurisé (gardées de votre version)
try {
  const usersRoutes = require('./routes/users');
  app.use('/api/users', usersRoutes);
  console.log('✅ Routes users chargées avec succès');
} catch (error) {
  console.error('❌ Erreur chargement routes users:', error.message);
  console.log('⚠️ Routes users non disponibles');
}

// ✅ ROUTES AUTH EXTERNES - Tentative de chargement (optionnel)
try {
  const authRoutes = require('./routes/auth');
  console.log('✅ Fichier routes/auth.js trouvé mais routes directes utilisées');
} catch (error) {
  console.log('💡 Fichier routes/auth.js non trouvé, utilisation des routes directes');
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
    error: 'Route non trouvee',
    path: req.originalUrl,
    method: req.method
  });
});

// Demarrage du serveur
async function startServer() {
  try {
    // Tester la connexion a la base de donnees
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('Impossible de se connecter a la base de donnees');
      console.log('Assurez-vous que :');
      console.log(' - MySQL est demarre');
      console.log(' - Les parametres dans .env sont corrects');
      console.log(' - La base de donnees existe (npm run init-db)');
      process.exit(1);
    }

    // ✅ CRÉER LES TABLES MISSIONS AUTOMATIQUEMENT
    await createMissionTablesIfNeeded();

    app.listen(PORT, () => {
      console.log('================================');
      console.log(`✅ Serveur MATRIX demarre !`);
      console.log(`Port: ${PORT}`);
      console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
      console.log(`API: http://localhost:${PORT}`);
      console.log(`Base de donnees: ${process.env.DB_NAME}`);
      console.log('Routes disponibles:');
      console.log('  📍 ROUTES DE TEST:');
      console.log('    - GET  /api/test');
      console.log('  🔐 ROUTES D\'AUTHENTIFICATION (DIRECTES):');
      console.log('    - POST /api/auth/login');
      console.log('    - POST /api/auth/create-admin');
      console.log('    - GET  /api/auth/debug-table');
      console.log('    - POST /api/auth/quick-admin-token');
      console.log('  👥 ROUTES UTILISATEURS:');
      console.log('    - GET  /api/users/health');
      console.log('    - GET  /api/users');
      console.log('    - GET  /api/users/stats');
      console.log('    - POST /api/users');
      console.log('    - PUT  /api/users/:id');
      console.log('    - PUT  /api/users/:id/status');
      console.log('    - DELETE /api/users/:id');
      console.log('    - POST /api/users/bulk-action');
      console.log('  📋 ROUTES MISSIONS (NOUVELLES):');
      console.log('    - GET  /api/missions');
      console.log('    - DELETE /api/missions/:id');
      console.log('    - PATCH /api/missions/:id/status');
      console.log('    - GET  /api/missions/stats/overview');
      console.log('================================');
      console.log('🎯 Testez le login avec:');
      console.log(`   curl -X POST http://localhost:${PORT}/api/auth/login \\`);
      console.log('     -H "Content-Type: application/json" \\');
      console.log('     -d \'{"email": "admin@matrix.com", "password": "adminPassword"}\'');
      console.log('💡 Testez les missions avec:');
      console.log(`   curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:${PORT}/api/missions`);
      console.log('================================');
    });
  } catch (error) {
    console.error('Erreur lors du demarrage du serveur:', error);
    process.exit(1);
  }
}

// Gestion propre de l'arret du serveur
process.on('SIGINT', () => {
  console.log('\nArret du serveur...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nArret du serveur...');
  process.exit(0);
});

startServer();