// scripts/add-missions.js - Script pour ajouter les missions à votre DB existante
const { pool } = require('../config/database');
require('dotenv').config();

async function addMissionsToDatabase() {
  let connection;
  
  try {
    console.log('🔗 === AJOUT DES MISSIONS À LA BASE EXISTANTE ===');
    
    connection = pool;
    
    console.log('📋 Création des tables pour les missions...');
    
    // 1. Mise à jour de la table missions (vérifier si elle existe déjà)
    await connection.execute(`
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
        location VARCHAR(255),
        experience_level ENUM('beginner', 'intermediate', 'expert') DEFAULT 'intermediate',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_freelance_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    console.log('✅ Table missions créée/vérifiée');

    // 2. Table pour les compétences (si pas déjà existante)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS skills (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) UNIQUE NOT NULL,
        category VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);
    console.log('✅ Table skills créée/vérifiée');

    // 3. Table de liaison mission-compétences
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS mission_skills (
        mission_id INT,
        skill_id INT,
        PRIMARY KEY (mission_id, skill_id),
        FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log('✅ Table mission_skills créée/vérifiée');

    // 4. Table pour les candidatures
    await connection.execute(`
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
    `);
    console.log('✅ Table applications créée/vérifiée');

    // 5. Table pour les signalements de missions
    await connection.execute(`
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
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_report (mission_id, reporter_id)
      ) ENGINE=InnoDB
    `);
    console.log('✅ Table mission_reports créée/vérifiée');

    // 6. Vérifier/créer la table freelance_profiles si pas existante
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS freelance_profiles (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        hourly_rate DECIMAL(10,2),
        availability BOOLEAN DEFAULT TRUE,
        experience_years INT DEFAULT 0,
        completed_missions INT DEFAULT 0,
        average_rating DECIMAL(3,2) DEFAULT 0,
        total_earnings DECIMAL(12,2) DEFAULT 0,
        response_time_hours INT DEFAULT 24,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_freelance (user_id)
      ) ENGINE=InnoDB
    `);
    console.log('✅ Table freelance_profiles créée/vérifiée');

    console.log('🎯 Ajout des données de test...');
    
    // Récupération des utilisateurs existants
    const [users] = await connection.execute(`
      SELECT id, email, user_type FROM users WHERE user_type IN ('client', 'freelance')
    `);
    
    let clientId, freelanceId;
    users.forEach(user => {
      if (user.user_type === 'client') clientId = user.id;
      if (user.user_type === 'freelance') freelanceId = user.id;
    });

    // Si pas d'utilisateurs clients/freelances, les créer
    if (!clientId) {
      console.log('📝 Création d\'un utilisateur client de test...');
      const bcrypt = require('bcrypt');
      const hashedPassword = await bcrypt.hash('client123', 12);
      
      const [result] = await connection.execute(`
        INSERT INTO users (
          first_name, last_name, email, password, user_type,
          is_active, email_verified, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'client', 1, 1, NOW(), NOW())
      `, ['Client', 'Test', 'client@matrix.com', hashedPassword]);
      
      clientId = result.insertId;
      console.log('✅ Client créé avec ID:', clientId);
    }

    if (!freelanceId) {
      console.log('📝 Création d\'un utilisateur freelance de test...');
      const bcrypt = require('bcrypt');
      const hashedPassword = await bcrypt.hash('freelance123', 12);
      
      const [result] = await connection.execute(`
        INSERT INTO users (
          first_name, last_name, email, password, user_type,
          is_active, email_verified, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'freelance', 1, 1, NOW(), NOW())
      `, ['Freelance', 'Test', 'freelance@matrix.com', hashedPassword]);
      
      freelanceId = result.insertId;
      console.log('✅ Freelance créé avec ID:', freelanceId);

      // Créer le profil freelance
      await connection.execute(`
        INSERT INTO freelance_profiles 
        (user_id, hourly_rate, availability, experience_years, completed_missions, average_rating, total_earnings, response_time_hours) 
        VALUES (?, 45.00, TRUE, 5, 12, 4.8, 15000.00, 2)
      `, [freelanceId]);
      console.log('✅ Profil freelance créé');
    }

    // Ajout des compétences de base
    console.log('🛠️ Ajout des compétences...');
    const skills = [
      ['JavaScript', 'Développement'],
      ['Angular', 'Développement'],
      ['Node.js', 'Développement'],
      ['React', 'Développement'],
      ['React Native', 'Développement'],
      ['PHP', 'Développement'],
      ['Python', 'Développement'],
      ['MongoDB', 'Développement'],
      ['PostgreSQL', 'Développement'],
      ['Express.js', 'Développement'],
      ['UI/UX Design', 'Design'],
      ['Photoshop', 'Design'],
      ['Figma', 'Design'],
      ['Illustrator', 'Design'],
      ['Rédaction web', 'Contenu'],
      ['SEO', 'Marketing'],
      ['Marketing digital', 'Marketing'],
      ['Google Ads', 'Marketing'],
      ['Analytics', 'Marketing'],
      ['WordPress', 'Développement'],
      ['Stripe API', 'Développement'],
      ['JWT', 'Développement'],
      ['Swagger', 'Développement']
    ];
    
    for (const [name, category] of skills) {
      await connection.execute(
        'INSERT IGNORE INTO skills (name, category) VALUES (?, ?)',
        [name, category]
      );
    }
    console.log(`✅ ${skills.length} compétences ajoutées`);

    // Ajout des missions de test
    console.log('📋 Ajout des missions de test...');
    const missions = [
      {
        title: 'Développement d\'une application e-commerce mobile',
        description: 'Création d\'une application mobile complète pour la vente en ligne. L\'application doit inclure un catalogue produits, un panier d\'achat, un système de paiement sécurisé via Stripe, et un tableau de bord administrateur. Interface utilisateur moderne et responsive requise.',
        category: 'Développement',
        budget_min: 4000,
        budget_max: 6000,
        budget_type: 'fixed',
        currency: 'EUR',
        deadline: '2024-06-15',
        client_id: clientId,
        status: 'open',
        is_remote: true,
        experience_level: 'expert',
        skills: ['React Native', 'Node.js', 'MongoDB', 'Stripe API', 'Express.js']
      },
      {
        title: 'Design UI/UX pour site web corporate',
        description: 'Refonte complète de l\'interface utilisateur d\'un site vitrine d\'entreprise. Le design doit être moderne, professionnel, responsive et optimisé pour la conversion. Livraison attendue : maquettes Figma + prototypes interactifs.',
        category: 'Design',
        budget_min: 2000,
        budget_max: 3500,
        budget_type: 'fixed',
        currency: 'EUR',
        deadline: '2024-05-20',
        client_id: clientId,
        assigned_freelance_id: freelanceId,
        status: 'in_progress',
        is_remote: true,
        experience_level: 'intermediate',
        skills: ['Figma', 'Photoshop', 'UI/UX Design', 'Illustrator']
      },
      {
        title: 'Rédaction d\'articles de blog SEO',
        description: 'Rédaction de 15 articles de blog optimisés SEO sur le thème du marketing digital et de la transformation numérique. Chaque article doit faire entre 1500 et 2000 mots, avec recherche de mots-clés et optimisation complète.',
        category: 'Rédaction',
        budget_min: 800,
        budget_max: 1200,
        budget_type: 'fixed',
        currency: 'EUR',
        deadline: '2024-04-30',
        client_id: clientId,
        assigned_freelance_id: freelanceId,
        status: 'completed',
        is_remote: true,
        experience_level: 'intermediate',
        skills: ['SEO', 'Marketing digital', 'Rédaction web', 'WordPress']
      },
      {
        title: 'Développement d\'une API REST complète',
        description: 'Création d\'une API REST robuste pour une application de gestion de stock. L\'API doit inclure l\'authentification JWT, la gestion des rôles utilisateurs, CRUD complet pour tous les modules, et documentation Swagger automatique.',
        category: 'Développement',
        budget_min: 3000,
        budget_max: 4500,
        budget_type: 'fixed',
        currency: 'EUR',
        deadline: '2024-07-01',
        client_id: clientId,
        status: 'open',
        is_remote: true,
        experience_level: 'expert',
        skills: ['Node.js', 'Express.js', 'PostgreSQL', 'JWT', 'Swagger']
      },
      {
        title: 'Campagne publicitaire Google Ads',
        description: 'Création et gestion d\'une campagne Google Ads pour une startup tech. Objectif : générer 500 leads qualifiés en 3 mois avec un budget publicitaire de 5000€. Inclut création des annonces, landing pages et suivi Analytics.',
        category: 'Marketing',
        budget_min: 1500,
        budget_max: 2000,
        budget_type: 'fixed',
        currency: 'EUR',
        deadline: '2024-08-15',
        client_id: clientId,
        status: 'cancelled',
        is_remote: true,
        experience_level: 'expert',
        skills: ['Google Ads', 'Analytics', 'Marketing digital', 'SEO']
      },
      {
        title: 'Développement d\'un dashboard Analytics',
        description: 'Création d\'un tableau de bord analytics en temps réel pour visualiser les données de vente. Interface moderne avec graphiques interactifs, filtres avancés et export de données. Technologies : Angular + Node.js + PostgreSQL.',
        category: 'Développement',
        budget_min: 2500,
        budget_max: 3500,
        budget_type: 'fixed',
        currency: 'EUR',
        deadline: '2024-05-30',
        client_id: clientId,
        status: 'open',
        is_remote: true,
        experience_level: 'intermediate',
        skills: ['Angular', 'Node.js', 'PostgreSQL', 'JavaScript']
      }
    ];

    // Insertion des missions
    for (const mission of missions) {
      try {
        const [result] = await connection.execute(
          `INSERT INTO missions 
           (title, description, category, budget_min, budget_max, budget_type, currency, deadline, client_id, assigned_freelance_id, status, is_remote, experience_level) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            mission.title, mission.description, mission.category,
            mission.budget_min, mission.budget_max, mission.budget_type,
            mission.currency, mission.deadline, mission.client_id,
            mission.assigned_freelance_id || null, mission.status,
            mission.is_remote, mission.experience_level
          ]
        );

        const missionId = result.insertId;
        console.log(`✅ Mission "${mission.title}" créée avec ID: ${missionId}`);

        // Ajout des compétences pour cette mission
        for (const skillName of mission.skills) {
          const [skillResult] = await connection.execute(
            'SELECT id FROM skills WHERE name = ?',
            [skillName]
          );

          if (skillResult.length > 0) {
            await connection.execute(
              'INSERT IGNORE INTO mission_skills (mission_id, skill_id) VALUES (?, ?)',
              [missionId, skillResult[0].id]
            );
          }
        }

      } catch (error) {
        console.error(`❌ Erreur lors de la création de la mission "${mission.title}":`, error.message);
      }
    }

    // Ajout de candidatures de test
    console.log('📝 Ajout de candidatures de test...');
    const [openMissions] = await connection.execute(
      'SELECT id FROM missions WHERE status = "open" LIMIT 3'
    );

    for (const mission of openMissions) {
      try {
        await connection.execute(
          `INSERT IGNORE INTO applications (mission_id, freelance_id, proposal, proposed_budget, proposed_deadline) 
           VALUES (?, ?, ?, ?, ?)`,
          [
            mission.id,
            freelanceId,
            'Je suis très intéressé par cette mission. Fort de mes 5 années d\'expérience, je peux livrer un travail de qualité dans les délais impartis. Mon portfolio démontre ma capacité à gérer des projets similaires.',
            Math.floor(Math.random() * 1000) + 2000,
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          ]
        );
        console.log(`✅ Candidature ajoutée pour mission ${mission.id}`);
      } catch (error) {
        console.log(`⚠️ Candidature déjà existante pour mission ${mission.id}`);
      }
    }

    // Ajout d'un signalement de test
    console.log('⚠️ Ajout d\'un signalement de test...');
    const [reportableMissions] = await connection.execute(
      'SELECT id FROM missions WHERE status = "in_progress" LIMIT 1'
    );

    if (reportableMissions.length > 0) {
      try {
        await connection.execute(
          'INSERT IGNORE INTO mission_reports (mission_id, reporter_id, reason) VALUES (?, ?, ?)',
          [
            reportableMissions[0].id, 
            freelanceId, 
            'Contenu de la description non conforme aux attentes. Le client a modifié les exigences après acceptation sans ajustement du budget.'
          ]
        );
        console.log('✅ Signalement de test ajouté');
      } catch (error) {
        console.log('⚠️ Signalement déjà existant');
      }
    }

    console.log('================================');
    console.log('✅ MIGRATION TERMINÉE AVEC SUCCÈS !');
    console.log('================================');
    console.log('📊 Résumé des ajouts :');
    console.log(`   - ${missions.length} missions de test`);
    console.log(`   - ${skills.length} compétences`);
    console.log('   - Tables missions complètes');
    console.log('   - Candidatures et signalements de test');
    console.log('');
    console.log('🔑 Comptes disponibles :');
    console.log('   Admin: admin@matrix.com');
    console.log('   Client: client@matrix.com / client123');
    console.log('   Freelance: freelance@matrix.com / freelance123');
    console.log('');
    console.log('🚀 Vous pouvez maintenant :');
    console.log('   1. Redémarrer votre serveur: npm run dev');
    console.log('   2. Tester les nouvelles routes missions');
    console.log('   3. Utiliser l\'interface admin pour gérer les missions');
    console.log('================================');
    
  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Vérification que ce script est exécuté directement
if (require.main === module) {
  addMissionsToDatabase()
    .then(() => {
      console.log('🎯 Migration terminée, fermeture de la connexion...');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erreur fatale:', error);
      process.exit(1);
    });
}

module.exports = { addMissionsToDatabase };