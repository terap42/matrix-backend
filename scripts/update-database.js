// scripts/update-database.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'matrix_db',
  multipleStatements: true
};

async function updateDatabase() {
  let connection;
  
  try {
    console.log('🔗 Connexion à la base de données...');
    connection = await mysql.createConnection(dbConfig);
    
    console.log('📋 Ajout des tables manquantes pour les missions...');
    
    // Table pour les compétences requises par mission
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS mission_skills (
        mission_id INT,
        skill_id INT,
        PRIMARY KEY (mission_id, skill_id),
        FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
        FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // Table pour les signalements de missions
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

    console.log('📊 Ajout de données de test pour les missions...');
    
    // Récupération des IDs des utilisateurs
    const [users] = await connection.execute(`
      SELECT id, user_type FROM users WHERE email IN ('client@matrix.com', 'freelance@matrix.com')
    `);
    
    let clientId, freelanceId;
    users.forEach(user => {
      if (user.user_type === 'client') clientId = user.id;
      if (user.user_type === 'freelance') freelanceId = user.id;
    });

    if (!clientId || !freelanceId) {
      console.log('⚠️ Utilisateurs de test non trouvés, création ignorée');
      return;
    }

    await connection.beginTransaction();

    try {
      // Missions de test
      const missions = [
        {
          title: 'Développement d\'une application e-commerce',
          description: 'Création d\'une application mobile pour la vente en ligne avec paiement intégré. L\'application doit inclure un catalogue produits, un panier d\'achat, un système de paiement sécurisé et un tableau de bord admin.',
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
          skills: ['React Native', 'Node.js', 'MongoDB', 'Stripe API']
        },
        {
          title: 'Design UI/UX pour site web corporate',
          description: 'Refonte complète de l\'interface utilisateur d\'un site vitrine d\'entreprise. Besoin d\'un design moderne, responsive et optimisé pour la conversion.',
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
          skills: ['Figma', 'Photoshop', 'HTML/CSS', 'UI/UX Design']
        },
        {
          title: 'Rédaction d\'articles de blog SEO',
          description: 'Rédaction de 15 articles de blog optimisés SEO sur le thème du marketing digital et de la transformation numérique. Chaque article doit faire entre 1500 et 2000 mots.',
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
          description: 'Création d\'une API REST robuste pour une application de gestion de stock. L\'API doit inclure l\'authentification, la gestion des rôles, CRUD complet et documentation Swagger.',
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
          description: 'Création et gestion d\'une campagne Google Ads pour une startup tech. Objectif : 500 leads qualifiés en 3 mois avec un budget de 5000€.',
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
          skills: ['Google Ads', 'Analytics', 'Marketing digital', 'Landing Pages']
        }
      ];

      // Insertion des missions
      for (const mission of missions) {
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

        // Ajout des compétences pour cette mission
        for (const skillName of mission.skills) {
          // Vérifier si la compétence existe
          let [skillResult] = await connection.execute(
            'SELECT id FROM skills WHERE name = ?',
            [skillName]
          );

          // Si la compétence n'existe pas, la créer
          if (skillResult.length === 0) {
            const category = skillName.includes('Design') || skillName.includes('Figma') || skillName.includes('Photoshop') ? 'Design' :
                           skillName.includes('Marketing') || skillName.includes('SEO') || skillName.includes('Ads') ? 'Marketing' :
                           'Développement';
            
            const [newSkill] = await connection.execute(
              'INSERT INTO skills (name, category) VALUES (?, ?)',
              [skillName, category]
            );
            skillResult = [{ id: newSkill.insertId }];
          }

          // Lier la compétence à la mission
          await connection.execute(
            'INSERT IGNORE INTO mission_skills (mission_id, skill_id) VALUES (?, ?)',
            [missionId, skillResult[0].id]
          );
        }
      }

      // Ajout d'un signalement de test
      const [reportedMissions] = await connection.execute(
        'SELECT id FROM missions WHERE status = "in_progress" LIMIT 1'
      );

      if (reportedMissions.length > 0) {
        await connection.execute(
          'INSERT IGNORE INTO mission_reports (mission_id, reporter_id, reason) VALUES (?, ?, ?)',
          [reportedMissions[0].id, freelanceId, 'Contenu inapproprié dans la description']
        );
      }

      // Ajout de candidatures de test
      const [openMissions] = await connection.execute(
        'SELECT id FROM missions WHERE status = "open" LIMIT 2'
      );

      for (const mission of openMissions) {
        await connection.execute(
          `INSERT IGNORE INTO applications (mission_id, freelance_id, proposal, proposed_budget, proposed_deadline) 
           VALUES (?, ?, ?, ?, ?)`,
          [
            mission.id,
            freelanceId,
            'Je suis très intéressé par cette mission. Fort de mes 5 années d\'expérience, je peux livrer un travail de qualité dans les délais impartis.',
            Math.floor(Math.random() * 1000) + 2000,
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          ]
        );
      }

      await connection.commit();
      
      console.log('✅ Base de données mise à jour avec succès !');
      console.log('\n📊 Données ajoutées :');
      console.log('   - 5 missions de test');
      console.log('   - Compétences associées');
      console.log('   - 1 signalement de test');
      console.log('   - Candidatures de test');
      
    } catch (error) {
      await connection.rollback();
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🚪 Connexion fermée');
    }
  }
}

updateDatabase();