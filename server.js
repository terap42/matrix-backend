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
      'POST /api/users/bulk-action'
    ]
  });
});

// ✅ ROUTES D'AUTHENTIFICATION DIRECTES

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
    
    // Voir la structure de la table
    const [structure] = await pool.execute('DESCRIBE users');
    
    // Voir quelques utilisateurs
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

// ✅ ROUTES UTILISATEURS - Chargement sécurisé
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
  // On n'utilise pas app.use ici car on a déjà les routes directes
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
      console.log('================================');
      console.log('🎯 Testez le login avec:');
      console.log(`   curl -X POST http://localhost:${PORT}/api/auth/login \\`);
      console.log('     -H "Content-Type: application/json" \\');
      console.log('     -d \'{"email": "admin@matrix.com", "password": "adminPassword"}\'');
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