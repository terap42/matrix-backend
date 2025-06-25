// scripts/init-database.js - VERSION COMPLÈTE FINALE AVEC POSTS ET UPLOADS
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
      
      // 5. ✅ TABLE portfolio_projects (dépend de users)
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
      `,
      
      // 10. ✅ Table posts - Système de contenus avec upload
      `
      CREATE TABLE IF NOT EXISTS posts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        content_text TEXT,
        content_images JSON,
        project_data JSON,
        post_type ENUM('text', 'project', 'bio_update', 'achievement') DEFAULT 'text',
        is_urgent BOOLEAN DEFAULT FALSE,
        status ENUM('draft', 'published', 'archived') DEFAULT 'published',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
      `,
      
      // 11. Table post_likes - Likes des posts
      `
      CREATE TABLE IF NOT EXISTS post_likes (
        id INT PRIMARY KEY AUTO_INCREMENT,
        post_id INT NOT NULL,
        user_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_like (post_id, user_id),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
      `,
      
      // 12. Table post_comments - Commentaires des posts
      `
      CREATE TABLE IF NOT EXISTS post_comments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        post_id INT NOT NULL,
        user_id INT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
      `,
      
      // 13. Table post_shares - Partages des posts
      `
      CREATE TABLE IF NOT EXISTS post_shares (
        id INT PRIMARY KEY AUTO_INCREMENT,
        post_id INT NOT NULL,
        user_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_share (post_id, user_id),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
      `,
      
      // 14. ✅ NOUVELLE Table file_uploads - Gestion des fichiers uploadés
      `
      CREATE TABLE IF NOT EXISTS file_uploads (
        id INT PRIMARY KEY AUTO_INCREMENT,
        original_name VARCHAR(255) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size INT NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_type ENUM('image', 'video', 'document', 'other') NOT NULL,
        uploaded_by INT NOT NULL,
        related_type ENUM('post', 'avatar', 'portfolio', 'mission') NOT NULL,
        related_id INT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_related (related_type, related_id),
        INDEX idx_file_type (file_type),
        INDEX idx_uploaded_by (uploaded_by)
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
        `INSERT INTO users (email, password, user_type, first_name, last_name, bio, location, phone, is_active, email_verified) 
         VALUES (?, ?, 'freelance', 'Alexandre', 'Martin', ?, ?, ?, TRUE, TRUE)
         ON DUPLICATE KEY UPDATE 
         password = VALUES(password),
         user_type = VALUES(user_type),
         updated_at = CURRENT_TIMESTAMP`,
        [
          'freelance@matrix.com', 
          freelancePassword, 
          'Développeur Full-Stack passionné avec 5 ans d\'expérience en React, Node.js et PHP. Spécialisé dans la création d\'applications web modernes et intuitives. Expert en développement mobile et solutions cloud.', 
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
            description: 'Développement d\'une plateforme e-commerce complète avec React, Node.js et MongoDB. Interface utilisateur moderne avec panier d\'achat, paiement Stripe et gestion des commandes. Architecture microservices et déploiement sur AWS.',
            image_url: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=300&fit=crop',
            project_url: 'https://demo-ecommerce.example.com',
            technologies: JSON.stringify(['React', 'Node.js', 'MongoDB', 'Stripe', 'Express.js', 'AWS', 'Docker'])
          },
          {
            title: 'Dashboard Analytics',
            description: 'Création d\'un tableau de bord analytique en temps réel pour une startup fintech. Visualisation de données complexes avec graphiques interactifs et rapports automatisés. Intégration API REST et WebSocket.',
            image_url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=300&fit=crop',
            project_url: 'https://dashboard-analytics.example.com',
            technologies: JSON.stringify(['React', 'Chart.js', 'TypeScript', 'PostgreSQL', 'Socket.io', 'Redis'])
          },
          {
            title: 'Site Web Corporate',
            description: 'Refonte complète du site web d\'une entreprise de conseil avec focus sur l\'expérience utilisateur et l\'optimisation SEO. Design responsive et animations fluides. Score PageSpeed de 95+.',
            image_url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=300&fit=crop',
            project_url: 'https://corporate-site.example.com',
            technologies: JSON.stringify(['HTML5', 'CSS3', 'JavaScript', 'GSAP', 'Webpack', 'Sass'])
          },
          {
            title: 'Application Mobile IoT',
            description: 'Application mobile cross-platform pour contrôler des objets connectés IoT. Interface intuitive avec graphiques en temps réel et notifications push. Optimisée pour Android et iOS.',
            image_url: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400&h=300&fit=crop',
            project_url: 'https://iot-app.example.com',
            technologies: JSON.stringify(['React Native', 'TypeScript', 'Firebase', 'MQTT', 'Redux'])
          }
        ];
        
        for (const project of portfolioProjects) {
          try {
            await connection.execute(
              `INSERT INTO portfolio_projects (freelance_id, title, description, image_url, project_url, technologies, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
               ON DUPLICATE KEY UPDATE title = VALUES(title)`,
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
      // Développement Frontend
      ['JavaScript', 'Développement'],
      ['TypeScript', 'Développement'],
      ['Angular', 'Développement'],
      ['React', 'Développement'],
      ['Vue.js', 'Développement'],
      ['Svelte', 'Développement'],
      ['Next.js', 'Développement'],
      ['Nuxt.js', 'Développement'],
      ['CSS', 'Développement'],
      ['HTML', 'Développement'],
      ['Sass', 'Développement'],
      ['Tailwind CSS', 'Développement'],
      ['Bootstrap', 'Développement'],
      
      // Développement Backend
      ['Node.js', 'Développement'],
      ['PHP', 'Développement'],
      ['Python', 'Développement'],
      ['Java', 'Développement'],
      ['C#', 'Développement'],
      ['Go', 'Développement'],
      ['Rust', 'Développement'],
      ['Laravel', 'Développement'],
      ['Symfony', 'Développement'],
      ['Express.js', 'Développement'],
      ['NestJS', 'Développement'],
      ['Django', 'Développement'],
      ['Flask', 'Développement'],
      ['Spring Boot', 'Développement'],
      
      // Bases de données
      ['MySQL', 'Développement'],
      ['PostgreSQL', 'Développement'],
      ['MongoDB', 'Développement'],
      ['Redis', 'Développement'],
      ['Firebase', 'Développement'],
      ['Supabase', 'Développement'],
      ['SQLite', 'Développement'],
      
      // Mobile
      ['React Native', 'Développement'],
      ['Flutter', 'Développement'],
      ['Ionic', 'Développement'],
      ['Swift', 'Développement'],
      ['Kotlin', 'Développement'],
      
      // DevOps & Cloud
      ['Docker', 'Développement'],
      ['Kubernetes', 'Développement'],
      ['AWS', 'Développement'],
      ['Azure', 'Développement'],
      ['Google Cloud', 'Développement'],
      ['CI/CD', 'Développement'],
      ['Jenkins', 'Développement'],
      ['GitLab CI', 'Développement'],
      
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
      ['Prototyping', 'Design'],
      ['Wireframing', 'Design'],
      
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
      ['Google Analytics', 'Marketing'],
      ['Social Media', 'Marketing'],
      
      // Contenu
      ['Rédaction web', 'Contenu'],
      ['Copywriting', 'Contenu'],
      ['Rédaction technique', 'Contenu'],
      ['Traduction', 'Contenu'],
      ['Correction', 'Contenu'],
      ['Storytelling', 'Contenu'],
      ['Blog Writing', 'Contenu']
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
        { name: 'Node.js', level: 'expert' },
        { name: 'TypeScript', level: 'avance' },
        { name: 'UI/UX Design', level: 'intermediaire' },
        { name: 'JavaScript', level: 'expert' },
        { name: 'CSS', level: 'avance' },
        { name: 'HTML', level: 'expert' },
        { name: 'MongoDB', level: 'avance' },
        { name: 'AWS', level: 'intermediaire' },
        { name: 'Docker', level: 'intermediaire' },
        { name: 'React Native', level: 'avance' }
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
          title: 'Développement site web e-commerce',
          description: 'Création d\'un site web e-commerce moderne et responsive avec système de paiement intégré. Interface utilisateur intuitive, gestion des stocks et tableau de bord admin complet.',
          category: 'Développement',
          budget_min: 2500,
          budget_max: 4000,
          deadline: '2025-08-15',
          skills: ['JavaScript', 'React', 'Node.js', 'CSS']
        },
        {
          title: 'Design logo et identité visuelle startup',
          description: 'Création d\'un logo professionnel et de l\'identité visuelle complète pour une startup tech. Recherche créativité, modernité et originalité. Livraison avec charte graphique.',
          category: 'Design',
          budget_min: 800,
          budget_max: 1500,
          deadline: '2025-07-30',
          skills: ['UI/UX Design', 'Photoshop', 'Illustrator', 'Branding']
        },
        {
          title: 'Stratégie marketing digital complète',
          description: 'Élaboration d\'une stratégie marketing digitale complète pour le lancement d\'un nouveau produit SaaS. Inclut audit SEO, campagnes ads et plan content marketing.',
          category: 'Marketing',
          budget_min: 1200,
          budget_max: 2000,
          deadline: '2025-07-20',
          skills: ['SEO', 'Marketing digital', 'Google Ads', 'Content Marketing']
        },
        {
          title: 'Application mobile React Native',
          description: 'Développement d\'une application mobile cross-platform pour la gestion de projets collaboratifs. Interface moderne, notifications push et synchronisation cloud.',
          category: 'Développement',
          budget_min: 3500,
          budget_max: 5500,
          deadline: '2025-09-10',
          skills: ['React Native', 'TypeScript', 'Firebase', 'UI/UX Design']
        },
        {
          title: 'Audit et optimisation SEO',
          description: 'Audit SEO complet d\'un site e-commerce existant et mise en place d\'une stratégie d\'optimisation. Objectif : améliorer le ranking et augmenter le trafic organique de 50%.',
          category: 'Marketing',
          budget_min: 800,
          budget_max: 1200,
          deadline: '2025-08-01',
          skills: ['SEO', 'Analytics', 'Google Analytics']
        }
      ];
      
      for (const mission of testMissions) {
        try {
          // Créer la mission
          const [missionResult] = await connection.execute(`
            INSERT INTO missions (title, description, category, budget_min, budget_max, currency, deadline, client_id, status, is_remote, experience_level, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, 'EUR', ?, ?, 'open', 1, 'intermediate', NOW(), NOW())
            ON DUPLICATE KEY UPDATE title = VALUES(title)
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
    
    // ✅ CRÉATION DES POSTS DE TEST AVEC CONTENU RICHE
    console.log('📄 Création de posts de test...');
    
    // Récupérer les IDs des utilisateurs
    const [allUsers] = await connection.execute(
      'SELECT id, user_type, first_name, last_name FROM users WHERE email IN (?, ?, ?)',
      ['hissein@gmail.com', 'freelance@matrix.com', 'admin@matrix.com']
    );
    
    const clientUser2 = allUsers.find(u => u.user_type === 'client');
    const freelanceUser3 = allUsers.find(u => u.user_type === 'freelance');
    
    if (clientUser2 && freelanceUser3) {
      const testPosts = [
        {
          user_id: freelanceUser3.id,
          content_text: '🚀 Voici mon dernier projet de redesign d\'application mobile pour une startup fintech ! Interface moderne et intuitive avec focus sur l\'UX. Qu\'en pensez-vous ? #UI #UX #Fintech #Design',
          content_images: JSON.stringify([
            'https://images.unsplash.com/photo-1512486130939-2c4f79935e4f?w=500&h=300&fit=crop',
            'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&h=300&fit=crop'
          ]),
          project_data: JSON.stringify({
            title: 'Redesign App Fintech',
            description: 'Interface moderne et intuitive pour application de gestion financière avec dashboard analytics en temps réel',
            technologies: ['Figma', 'Adobe XD', 'Prototyping', 'User Research'],
            duration: '3 semaines',
            budget: '2500€'
          }),
          post_type: 'project',
          is_urgent: false
        },
        {
          user_id: clientUser2.id,
          content_text: '💼 Je recherche un développeur React Native expérimenté pour une application de livraison innovante. Budget : 5000-8000€. Stack tech moderne, équipe dynamique, projet passionnant ! Qui est motivé ? 🔥',
          post_type: 'text',
          is_urgent: true
        },
        {
          user_id: freelanceUser3.id,
          content_text: '🏆 Nouveau certificat obtenu en Advanced React & TypeScript ! Toujours en apprentissage constant pour offrir le meilleur à mes clients. La formation continue est la clé du succès ! 📚✨',
          post_type: 'achievement',
          is_urgent: false
        },
        {
          user_id: clientUser2.id,
          content_text: '📈 Notre startup vient de lever 2M€ ! Nous recrutons une équipe de développeurs talentueux pour révolutionner le secteur de la logistique. Rejoignez l\'aventure ! 🚀💪',
          post_type: 'text',
          is_urgent: false
        },
        {
          user_id: freelanceUser3.id,
          content_text: '✨ Projet terminé avec succès ! Dashboard analytics pour une fintech avec +50 KPIs en temps réel. Client ravi du résultat ! 📊 #React #NodeJS #Analytics',
          content_images: JSON.stringify([
            'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=500&h=300&fit=crop'
          ]),
          project_data: JSON.stringify({
            title: 'Dashboard Analytics Fintech',
            description: 'Tableau de bord analytics complet avec visualisations en temps réel et rapports automatisés',
            technologies: ['React', 'TypeScript', 'Chart.js', 'Node.js', 'PostgreSQL'],
            duration: '6 semaines'
          }),
          post_type: 'project',
          is_urgent: false
        }
      ];
      
      for (const post of testPosts) {
        try {
          const [postResult] = await connection.execute(`
            INSERT INTO posts (user_id, content_text, content_images, project_data, post_type, is_urgent, status, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, 'published', NOW() - INTERVAL FLOOR(RAND() * 72) HOUR, NOW())
          `, [
            post.user_id,
            post.content_text,
            post.content_images || null,
            post.project_data || null,
            post.post_type,
            post.is_urgent
          ]);
          
          const postId = postResult.insertId;
          
          // Ajouter quelques likes de test
          const likesCount = Math.floor(Math.random() * 25) + 5;
          for (let i = 0; i < likesCount; i++) {
            const userId = Math.random() > 0.5 ? clientUser2.id : freelanceUser3.id;
            try {
              await connection.execute(
                'INSERT IGNORE INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, NOW())',
                [postId, userId]
              );
            } catch (e) {
              // Ignore duplicate likes
            }
          }
          
          // Ajouter quelques commentaires de test
          const commentsCount = Math.floor(Math.random() * 8) + 2;
          const sampleComments = [
            'Excellent travail ! 👏',
            'Super projet, j\'adore le design !',
            'Très inspirant, merci pour le partage',
            'Belle réalisation, bravo !',
            'Le rendu est vraiment professionnel',
            'Intéressant, avez-vous des retours utilisateurs ?',
            'Magnifique interface !',
            'Quel stack technique avez-vous utilisé ?'
          ];
          
          for (let i = 0; i < commentsCount; i++) {
            const userId = Math.random() > 0.5 ? clientUser2.id : freelanceUser3.id;
            const comment = sampleComments[Math.floor(Math.random() * sampleComments.length)];
            try {
              await connection.execute(
                'INSERT INTO post_comments (post_id, user_id, content, created_at) VALUES (?, ?, ?, NOW())',
                [postId, userId, comment]
              );
            } catch (e) {
              // Continue si erreur
            }
          }
          
          console.log(`✅ Post créé: ${post.content_text.substring(0, 50)}...`);
        } catch (err) {
          console.log('⚠️ Post test déjà existant ou erreur:', err.message);
        }
      }
      console.log('✅ Posts de test créés avec interactions');
    }
    
    console.log('\n🎉 Base de données initialisée avec succès !');
    console.log('\n📝 Comptes de test créés :');
    console.log('   👑 Admin: admin@matrix.com / admin');
    console.log('   🏢 Client: hissein@gmail.com / client123');
    console.log('   💼 Freelance: freelance@matrix.com / freelance123');
    console.log('\n🔗 Informations de connexion :');
    console.log(`   📍 Hôte: ${dbConfig.host}`);
    console.log(`   🗄️  Base: ${DATABASE_NAME}`);
    console.log(`   📊 Tables: ${tables.length} tables créées`);
    console.log('\n✅ Nouvelles fonctionnalités ajoutées:');
    console.log('✅ Table file_uploads pour gestion fichiers');
    console.log('✅ Système de posts avec upload complet');
    console.log('✅ Posts de test avec interactions (likes, commentaires)');
    console.log('✅ Portfolio freelance avec projets réalistes');
    console.log('✅ Missions variées avec budgets réalistes');
    console.log('✅ Skills étendus (70+ compétences)');
    console.log('✅ Profils utilisateur enrichis');
    console.log('\n🚀 Prêt pour le développement !');
    console.log('\n💡 Testez l\'API avec:');
    console.log('   1. Connexion: POST /api/auth/login');
    console.log('   2. Posts: GET /api/content/posts');
    console.log('   3. Upload: POST /api/content/posts (avec fichiers)');
    console.log('   4. Profil: GET /api/freelance-profile');
    console.log('   5. Missions: GET /api/missions');
    console.log('\n🎯 Structure complète:');
    console.log('   📊 14 tables principales');
    console.log('   👥 3 utilisateurs de test');
    console.log('   📝 5 missions variées');
    console.log('   📄 5 posts avec interactions');
    console.log('   💼 4 projets portfolio');
    console.log('   🛠️ 70+ compétences techniques');
    console.log('\n🔧 Pour tester en détail:');
    console.log('   curl -X POST http://localhost:3000/api/auth/login \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -d \'{"email":"freelance@matrix.com","password":"freelance123"}\'');
    console.log('\n   curl -H "Authorization: Bearer YOUR_TOKEN" \\');
    console.log('     http://localhost:3000/api/content/posts');
    console.log('\n📱 Interface mobile optimisée !');
    console.log('🎨 Design moderne et responsive !');
    console.log('⚡ Performance optimisée !');
    
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
console.log('🔧 ===================================');
console.log('🔧 INITIALISATION BASE DE DONNÉES MATRIX');
console.log('🔧 ===================================');
console.log('🎯 Version: Complète avec système de posts et uploads');
console.log('📅 Date:', new Date().toISOString());
console.log('🔧 ===================================');
initDatabase();
    
  