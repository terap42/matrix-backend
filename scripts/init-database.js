// scripts/init-database.js - VERSION COMPLÈTE FINALE AVEC PORTFOLIO_PROJECTS
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true
};

const DATABASE_NAME = process.env.DB_NAME || 'matrix_db';

async function initDatabase() {
  let connection;
  
  try {
    console.log('🔗 Connexion à MySQL...');
    connection = await mysql.createConnection(dbConfig);
    
    // Créer la base de données
    console.log('📊 Création de la base de données...');
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${DATABASE_NAME}`);
    await connection.query(`USE ${DATABASE_NAME}`);
    
    console.log('📋 Création des tables...');
    
    // ✅ ORDRE CORRECT DE CRÉATION DES TABLES (SANS DÉPENDANCES D'ABORD)
    const tables = [
      // 1. Table users (base)
      `
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        user_type ENUM('freelance', 'client', 'admin') NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        avatar VARCHAR(500),
        bio TEXT,
        location VARCHAR(255),
        phone VARCHAR(20),
        website VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        email_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
      `,
      
      // 2. Table skills (indépendante) ✅ AVEC created_at
      `
      CREATE TABLE IF NOT EXISTS skills (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) UNIQUE NOT NULL,
        category VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
      `,
      
      // 3. Table freelance_profiles (dépend de users) ✅ AVEC created_at et updated_at
      `
      CREATE TABLE IF NOT EXISTS freelance_profiles (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL UNIQUE,
        hourly_rate DECIMAL(10,2) DEFAULT 0,
        availability BOOLEAN DEFAULT TRUE,
        experience_years INT DEFAULT 0,
        completed_missions INT DEFAULT 0,
        average_rating DECIMAL(3,2) DEFAULT 0,
        total_earnings DECIMAL(12,2) DEFAULT 0,
        response_time_hours INT DEFAULT 24,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
      `,
      
      // 4. Table user_skills (dépend de users et skills) ✅ AVEC created_at et proficiency corrigé
      `
      CREATE TABLE IF NOT EXISTS user_skills (
        user_id INT,
        skill_id INT,
        proficiency ENUM('debutant', 'intermediaire', 'avance', 'expert') DEFAULT 'intermediaire',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, skill_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
      `,
      
      // 5. ✅ NOUVELLE TABLE portfolio_projects (dépend de users)
      `
      CREATE TABLE IF NOT EXISTS portfolio_projects (
        id INT PRIMARY KEY AUTO_INCREMENT,
        freelance_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        image_url VARCHAR(500),
        project_url VARCHAR(500),
        technologies JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (freelance_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
      `,
      
      // 6. Table missions (dépend de users)
      `
      CREATE TABLE IF NOT EXISTS missions (
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
        is_urgent BOOLEAN DEFAULT FALSE,
        location VARCHAR(255),
        experience_level ENUM('beginner', 'intermediate', 'expert') DEFAULT 'intermediate',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_freelance_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB
      `,
      
      // 7. Table mission_skills (dépend de missions et skills) ✅ CORRIGÉE
      `
      CREATE TABLE IF NOT EXISTS mission_skills (
        id INT PRIMARY KEY AUTO_INCREMENT,
        mission_id INT NOT NULL,
        skill_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_mission_skill (mission_id, skill_id),
        FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
      `,
      
      // 8. Table applications (dépend de missions et users)
      `
      CREATE TABLE IF NOT EXISTS applications (
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
      `,
      
      // 9. Table mission_reports (dépend de missions et users)
      `
      CREATE TABLE IF NOT EXISTS mission_reports (
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
      `
    ];

    // Créer chaque table avec gestion d'erreurs
    for (let i = 0; i < tables.length; i++) {
      try {
        await connection.query(tables[i]);
        console.log(`✅ Table ${i + 1}/${tables.length} créée`);
      } catch (err) {
        console.error(`❌ Erreur lors de la création de la table ${i + 1}:`, err.message);
        throw err;
      }
    }
    
    console.log('👤 Création des utilisateurs de test...');
    
    // Hachage des mots de passe en parallèle
    const [adminPassword, clientPassword, freelancePassword] = await Promise.all([
      bcrypt.hash('admin', 12),
      bcrypt.hash('client123', 12),
      bcrypt.hash('freelance123', 12)
    ]);
    
    await connection.beginTransaction();
    
    try {
      // Créer Admin
      const [adminResult] = await connection.execute(
        `INSERT INTO users (email, password, user_type, first_name, last_name, is_active, email_verified) 
         VALUES (?, ?, 'admin', 'Admin', 'MATRIX', TRUE, TRUE)
         ON DUPLICATE KEY UPDATE 
         password = VALUES(password),
         user_type = VALUES(user_type),
         updated_at = CURRENT_TIMESTAMP`,
        ['admin@matrix.com', adminPassword]
      );
      console.log('✅ Admin créé/mis à jour');
      
      // Créer Client
      const [clientResult] = await connection.execute(
        `INSERT INTO users (email, password, user_type, first_name, last_name, bio, location, is_active, email_verified) 
         VALUES (?, ?, 'client', 'Hissein', 'Test', ?, ?, TRUE, TRUE)
         ON DUPLICATE KEY UPDATE 
         password = VALUES(password),
         user_type = VALUES(user_type),
         updated_at = CURRENT_TIMESTAMP`,
        [
          'hissein@gmail.com', 
          clientPassword, 
          'Je suis un client à la recherche de freelances talentueux pour mes projets', 
          'Paris, France'
        ]
      );
      console.log('✅ Client créé/mis à jour');
      
      // Créer Freelance
      const [freelanceResult] = await connection.execute(
        `INSERT INTO users (email, password, user_type, first_name, last_name, bio, location, phone, is_active, email_verified) 
         VALUES (?, ?, 'freelance', 'Alexandre', 'Martin', ?, ?, ?, TRUE, TRUE)
         ON DUPLICATE KEY UPDATE 
         password = VALUES(password),
         user_type = VALUES(user_type),
         updated_at = CURRENT_TIMESTAMP`,
        [
          'freelance@matrix.com', 
          freelancePassword, 
          'Développeur Full-Stack passionné avec 5 ans d\'expérience en React, Node.js et PHP. Spécialisé dans la création d\'applications web modernes et intuitives.', 
          'Lyon, France', 
          '+33123456789'
        ]
      );
      console.log('✅ Freelance créé/mis à jour');
      
      // Créer profil freelance avec compétences et portfolio
      const [freelanceUser] = await connection.execute(
        `SELECT id FROM users WHERE email = ?`,
        ['freelance@matrix.com']
      );
      
      if (freelanceUser.length > 0) {
        const freelanceId = freelanceUser[0].id;
        
        // Créer le profil freelance
        await connection.execute(
          `INSERT INTO freelance_profiles 
           (user_id, hourly_rate, availability, experience_years, completed_missions, average_rating, total_earnings, response_time_hours, created_at, updated_at) 
           VALUES (?, 45.00, TRUE, 5, 12, 4.8, 15000.00, 2, NOW(), NOW())
           ON DUPLICATE KEY UPDATE 
           hourly_rate = VALUES(hourly_rate),
           experience_years = VALUES(experience_years),
           completed_missions = VALUES(completed_missions),
           average_rating = VALUES(average_rating),
           total_earnings = VALUES(total_earnings),
           updated_at = NOW()`,
          [freelanceId]
        );
        console.log('✅ Profil freelance créé/mis à jour');
        
        // Ajouter des compétences au freelance (après avoir créé les skills)
        console.log('⏳ Compétences freelance seront ajoutées après création des skills...');
        
        // Créer des projets portfolio pour le freelance
        const portfolioProjects = [
          {
            title: 'Application E-commerce React',
            description: 'Développement d\'une plateforme e-commerce complète avec React, Node.js et MongoDB. Interface utilisateur moderne avec panier d\'achat, paiement Stripe et gestion des commandes.',
            image_url: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=300&fit=crop',
            project_url: 'https://demo-ecommerce.example.com',
            technologies: JSON.stringify(['React', 'Node.js', 'MongoDB', 'Stripe', 'Express.js'])
          },
          {
            title: 'Dashboard Analytics',
            description: 'Création d\'un tableau de bord analytique en temps réel pour une startup fintech. Visualisation de données complexes avec graphiques interactifs et rapports automatisés.',
            image_url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=300&fit=crop',
            project_url: 'https://dashboard-analytics.example.com',
            technologies: JSON.stringify(['React', 'Chart.js', 'TypeScript', 'PostgreSQL', 'Socket.io'])
          },
          {
            title: 'Site Web Corporate',
            description: 'Refonte complète du site web d\'une entreprise de conseil avec focus sur l\'expérience utilisateur et l\'optimisation SEO. Design responsive et animations fluides.',
            image_url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=300&fit=crop',
            project_url: 'https://corporate-site.example.com',
            technologies: JSON.stringify(['HTML5', 'CSS3', 'JavaScript', 'GSAP', 'Webpack'])
          }
        ];
        
        for (const project of portfolioProjects) {
          try {
            await connection.execute(
              `INSERT INTO portfolio_projects (freelance_id, title, description, image_url, project_url, technologies, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
              [freelanceId, project.title, project.description, project.image_url, project.project_url, project.technologies]
            );
          } catch (err) {
            console.log(`⚠️ Erreur ajout projet ${project.title}:`, err.message);
          }
        }
        console.log('✅ Projets portfolio créés');
      }
      
      await connection.commit();
      console.log('✅ Transaction utilisateurs terminée');
      
    } catch (err) {
      await connection.rollback();
      console.error('❌ Erreur transaction utilisateurs:', err);
      throw err;
    }
    
    console.log('🛠️ Ajout des compétences...');
    const skills = [
      // Développement
      ['JavaScript', 'Développement'],
      ['TypeScript', 'Développement'],
      ['Angular', 'Développement'],
      ['React', 'Développement'],
      ['Vue.js', 'Développement'],
      ['Node.js', 'Développement'],
      ['PHP', 'Développement'],
      ['Python', 'Développement'],
      ['Java', 'Développement'],
      ['C#', 'Développement'],
      ['Laravel', 'Développement'],
      ['Symfony', 'Développement'],
      ['Express.js', 'Développement'],
      ['NestJS', 'Développement'],
      ['MySQL', 'Développement'],
      ['PostgreSQL', 'Développement'],
      ['MongoDB', 'Développement'],
      ['Firebase', 'Développement'],
      ['CSS', 'Développement'],
      ['HTML', 'Développement'],
      
      // Design
      ['UI/UX Design', 'Design'],
      ['Photoshop', 'Design'],
      ['Illustrator', 'Design'],
      ['Figma', 'Design'],
      ['Sketch', 'Design'],
      ['Adobe XD', 'Design'],
      ['Branding', 'Design'],
      ['Logo Design', 'Design'],
      ['Web Design', 'Design'],
      ['Graphic Design', 'Design'],
      
      // Marketing
      ['SEO', 'Marketing'],
      ['Marketing digital', 'Marketing'],
      ['Google Ads', 'Marketing'],
      ['Facebook Ads', 'Marketing'],
      ['Instagram Marketing', 'Marketing'],
      ['LinkedIn Marketing', 'Marketing'],
      ['Content Marketing', 'Marketing'],
      ['Email Marketing', 'Marketing'],
      ['Analytics', 'Marketing'],
      
      // Contenu
      ['Rédaction web', 'Contenu'],
      ['Copywriting', 'Contenu'],
      ['Rédaction technique', 'Contenu'],
      ['Traduction', 'Contenu'],
      ['Correction', 'Contenu']
    ];
    
    // Insertion des compétences avec gestion d'erreurs
    try {
      for (const [name, category] of skills) {
        await connection.execute(
          `INSERT IGNORE INTO skills (name, category, created_at) VALUES (?, ?, NOW())`,
          [name, category]
        );
      }
      console.log(`✅ ${skills.length} compétences ajoutées`);
    } catch (err) {
      console.error('❌ Erreur ajout compétences:', err);
    }
    
    // Maintenant ajouter les compétences au freelance
    console.log('🎯 Ajout compétences au freelance...');
    const [freelanceUser2] = await connection.execute(
      `SELECT id FROM users WHERE email = ?`,
      ['freelance@matrix.com']
    );
    
    if (freelanceUser2.length > 0) {
      const freelanceId = freelanceUser2[0].id;
      const freelanceSkills = [
        { name: 'React', level: 'expert' },
        { name: 'Node.js', level: 'avance' },
        { name: 'TypeScript', level: 'avance' },
        { name: 'UI/UX Design', level: 'intermediaire' },
        { name: 'JavaScript', level: 'expert' },
        { name: 'CSS', level: 'avance' },
        { name: 'HTML', level: 'expert' }
      ];
      
      for (const skill of freelanceSkills) {
        try {
          // Récupérer l'ID de la compétence
          const [skillResult] = await connection.execute(
            'SELECT id FROM skills WHERE name = ?',
            [skill.name]
          );
          
          if (skillResult.length > 0) {
            await connection.execute(
              'INSERT IGNORE INTO user_skills (user_id, skill_id, proficiency, created_at) VALUES (?, ?, ?, NOW())',
              [freelanceId, skillResult[0].id, skill.level]
            );
          }
        } catch (err) {
          console.log(`⚠️ Erreur ajout compétence ${skill.name}:`, err.message);
        }
      }
      console.log('✅ Compétences freelance ajoutées');
    }
    
    // Créer quelques missions de test
    console.log('📝 Création de missions de test...');
    const [clientUser] = await connection.execute(
      `SELECT id FROM users WHERE email = ?`,
      ['hissein@gmail.com']
    );
    
    if (clientUser.length > 0) {
      const clientId = clientUser[0].id;
      const testMissions = [
        {
          title: 'Développement site web vitrine',
          description: 'Création d\'un site web moderne et responsive pour présenter les services de notre entreprise. Design épuré et navigation intuitive requise.',
          category: 'Développement',
          budget_min: 1500,
          budget_max: 2500,
          deadline: '2025-08-15',
          skills: ['JavaScript', 'React', 'CSS']
        },
        {
          title: 'Design logo et identité visuelle',
          description: 'Création d\'un logo professionnel et de l\'identité visuelle complète pour une startup tech. Recherche créativité et originalité.',
          category: 'Design',
          budget_min: 800,
          budget_max: 1200,
          deadline: '2025-07-30',
          skills: ['UI/UX Design', 'Photoshop', 'Illustrator']
        },
        {
          title: 'Stratégie marketing digital',
          description: 'Élaboration d\'une stratégie marketing complète pour le lancement d\'un nouveau produit. Inclut réseaux sociaux et SEO.',
          category: 'Marketing',
          budget_min: 600,
          budget_max: 1000,
          deadline: '2025-07-20',
          skills: ['SEO', 'Marketing digital', 'Google Ads']
        }
      ];
      
      for (const mission of testMissions) {
        try {
          // Créer la mission
          const [missionResult] = await connection.execute(`
            INSERT INTO missions (title, description, category, budget_min, budget_max, currency, deadline, client_id, status, is_remote, experience_level, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, 'EUR', ?, ?, 'open', 1, 'intermediate', NOW(), NOW())
          `, [
            mission.title, 
            mission.description, 
            mission.category, 
            mission.budget_min, 
            mission.budget_max, 
            mission.deadline, 
            clientId
          ]);
          
          const missionId = missionResult.insertId;
          
          // Ajouter les skills à la mission
          for (const skillName of mission.skills) {
            const [skillResult] = await connection.execute(
              'SELECT id FROM skills WHERE name = ?',
              [skillName]
            );
            
            if (skillResult.length > 0) {
              await connection.execute(
                'INSERT IGNORE INTO mission_skills (mission_id, skill_id, created_at) VALUES (?, ?, NOW())',
                [missionId, skillResult[0].id]
              );
            }
          }
          
          console.log(`✅ Mission créée: ${mission.title}`);
        } catch (err) {
          console.log('⚠️ Mission test déjà existante ou erreur:', mission.title);
        }
      }
      console.log('✅ Missions de test créées');
    }
    
    console.log('\n🎉 Base de données initialisée avec succès !');
    console.log('\n📝 Comptes de test créés :');
    console.log('   👑 Admin: admin@matrix.com / admin');
    console.log('   🏢 Client: hissein@gmail.com / client123');
    console.log('   💼 Freelance: freelance@matrix.com / freelance123');
    console.log('\n🔗 Informations de connexion :');
    console.log(`   📍 Hôte: ${dbConfig.host}`);
    console.log(`   🗄️  Base: ${DATABASE_NAME}`);
    console.log(`   📊 Tables: users, freelance_profiles, skills, missions, portfolio_projects, etc.`);
    console.log('\n✅ Tables avec created_at/updated_at corrigées');
    console.log('✅ Relations entre missions et skills configurées');
    console.log('✅ Table portfolio_projects ajoutée avec données de test');
    console.log('✅ Profil freelance complet avec compétences et portfolio');
    console.log('✅ Enum proficiency corrigé (debutant, intermediaire, avance, expert)');
    console.log('\n🚀 Prêt pour le développement !');
    console.log('\n💡 Testez l\'API freelance-profile avec:');
    console.log('   1. Connectez-vous: POST /api/auth/login');
    console.log('   2. Récupérez le profil: GET /api/freelance-profile');
    console.log('   3. Testez les stats: GET /api/freelance-profile/stats');
    
  } catch (error) {
    console.error('\n❌ Erreur critique lors de l\'initialisation:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🚪 Connexion MySQL fermée');
    }
  }
}

// Gestion des erreurs non catchées
process.on('unhandledRejection', (err) => {
  console.error('⚠️ Erreur Promise non gérée:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('⚠️ Exception non catchée:', err);
  process.exit(1);
});

// Lancement du script
console.log('🔧 Initialisation de la base de données MATRIX...');
initDatabase();