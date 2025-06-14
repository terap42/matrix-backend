// routes/missions.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const auth = require('../middleware/auth');

// Récupérer toutes les missions avec filtres et pagination
router.get('/', auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      category,
      search,
      isReported,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    let whereConditions = [];
    let queryParams = [];

    // Construction des conditions WHERE
    if (status) {
      whereConditions.push('m.status = ?');
      queryParams.push(status);
    }

    if (category) {
      whereConditions.push('m.category = ?');
      queryParams.push(category);
    }

    if (search) {
      whereConditions.push('(m.title LIKE ? OR m.description LIKE ? OR CONCAT(u.first_name, " ", u.last_name) LIKE ?)');
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    if (isReported !== undefined) {
      whereConditions.push('mr.id IS ' + (isReported === 'true' ? 'NOT NULL' : 'NULL'));
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    // Requête pour compter le total
    const countQuery = `
      SELECT COUNT(DISTINCT m.id) as total
      FROM missions m
      LEFT JOIN users u ON m.client_id = u.id
      LEFT JOIN mission_reports mr ON m.id = mr.mission_id
      ${whereClause}
    `;

    const [countResult] = await db.execute(countQuery, queryParams);
    const totalItems = countResult[0].total;

    // Requête principale avec jointures
    const query = `
      SELECT 
        m.*,
        u.first_name,
        u.last_name,
        u.email as client_email,
        af.first_name as assigned_freelance_first_name,
        af.last_name as assigned_freelance_last_name,
        (SELECT COUNT(*) FROM applications WHERE mission_id = m.id) as applications_count,
        mr.reason as report_reason,
        mr.created_at as reported_at,
        GROUP_CONCAT(DISTINCT s.name) as required_skills
      FROM missions m
      LEFT JOIN users u ON m.client_id = u.id
      LEFT JOIN users af ON m.assigned_freelance_id = af.id
      LEFT JOIN mission_reports mr ON m.id = mr.mission_id
      LEFT JOIN mission_skills ms ON m.id = ms.mission_id
      LEFT JOIN skills s ON ms.skill_id = s.id
      ${whereClause}
      GROUP BY m.id
      ORDER BY m.${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), parseInt(offset));
    const [missions] = await db.execute(query, queryParams);

    // Formatage des données
    const formattedMissions = missions.map(mission => ({
      id: mission.id.toString(),
      title: mission.title,
      description: mission.description,
      budget: mission.budget_max || mission.budget_min,
      currency: mission.currency,
      status: mission.status,
      category: mission.category,
      clientId: mission.client_id.toString(),
      clientName: `${mission.first_name} ${mission.last_name}`,
      clientEmail: mission.client_email,
      freelancerId: mission.assigned_freelance_id?.toString(),
      freelancerName: mission.assigned_freelance_first_name 
        ? `${mission.assigned_freelance_first_name} ${mission.assigned_freelance_last_name}` 
        : null,
      skillsRequired: mission.required_skills ? mission.required_skills.split(',') : [],
      createdAt: mission.created_at,
      updatedAt: mission.updated_at,
      deadline: mission.deadline,
      applicationsCount: mission.applications_count,
      isReported: !!mission.report_reason,
      reportReason: mission.report_reason,
      priority: mission.experience_level || 'medium'
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
    console.error('Erreur lors de la récupération des missions:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des missions'
    });
  }
});

// Récupérer une mission par ID
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        m.*,
        u.first_name,
        u.last_name,
        u.email as client_email,
        u.phone as client_phone,
        af.first_name as assigned_freelance_first_name,
        af.last_name as assigned_freelance_last_name,
        af.email as assigned_freelance_email,
        (SELECT COUNT(*) FROM applications WHERE mission_id = m.id) as applications_count,
        mr.reason as report_reason,
        mr.created_at as reported_at,
        mr.reporter_id,
        GROUP_CONCAT(DISTINCT s.name) as required_skills
      FROM missions m
      LEFT JOIN users u ON m.client_id = u.id
      LEFT JOIN users af ON m.assigned_freelance_id = af.id
      LEFT JOIN mission_reports mr ON m.id = mr.mission_id
      LEFT JOIN mission_skills ms ON m.id = ms.mission_id
      LEFT JOIN skills s ON ms.skill_id = s.id
      WHERE m.id = ?
      GROUP BY m.id
    `;

    const [missions] = await db.execute(query, [id]);

    if (missions.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mission non trouvée'
      });
    }

    const mission = missions[0];
    const formattedMission = {
      id: mission.id.toString(),
      title: mission.title,
      description: mission.description,
      budget: mission.budget_max || mission.budget_min,
      budgetMin: mission.budget_min,
      budgetMax: mission.budget_max,
      budgetType: mission.budget_type,
      currency: mission.currency,
      status: mission.status,
      category: mission.category,
      clientId: mission.client_id.toString(),
      clientName: `${mission.first_name} ${mission.last_name}`,
      clientEmail: mission.client_email,
      clientPhone: mission.client_phone,
      freelancerId: mission.assigned_freelance_id?.toString(),
      freelancerName: mission.assigned_freelance_first_name 
        ? `${mission.assigned_freelance_first_name} ${mission.assigned_freelance_last_name}` 
        : null,
      freelancerEmail: mission.assigned_freelance_email,
      skillsRequired: mission.required_skills ? mission.required_skills.split(',') : [],
      createdAt: mission.created_at,
      updatedAt: mission.updated_at,
      deadline: mission.deadline,
      applicationsCount: mission.applications_count,
      isReported: !!mission.report_reason,
      reportReason: mission.report_reason,
      reportedAt: mission.reported_at,
      reporterId: mission.reporter_id,
      priority: mission.experience_level || 'medium',
      isRemote: mission.is_remote,
      location: mission.location,
      experienceLevel: mission.experience_level
    };

    res.json({
      success: true,
      data: formattedMission
    });

  } catch (error) {
    console.error('Erreur lors de la récupération de la mission:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération de la mission'
    });
  }
});

// Créer une nouvelle mission
router.post('/', auth, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      budgetMin,
      budgetMax,
      budgetType = 'fixed',
      currency = 'EUR',
      deadline,
      isRemote = true,
      location,
      experienceLevel = 'intermediate',
      skillsRequired = []
    } = req.body;

    // Validation
    if (!title || !description || !category) {
      return res.status(400).json({
        success: false,
        message: 'Les champs titre, description et catégorie sont obligatoires'
      });
    }

    await db.beginTransaction();

    try {
      // Insertion de la mission
      const [result] = await db.execute(
        `INSERT INTO missions 
         (title, description, category, budget_min, budget_max, budget_type, currency, deadline, client_id, is_remote, location, experience_level) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [title, description, category, budgetMin, budgetMax, budgetType, currency, deadline, req.user.id, isRemote, location, experienceLevel]
      );

      const missionId = result.insertId;

      // Ajout des compétences requises
      if (skillsRequired.length > 0) {
        for (const skillName of skillsRequired) {
          // Vérifier si la compétence existe, sinon la créer
          let [skillResult] = await db.execute('SELECT id FROM skills WHERE name = ?', [skillName]);
          
          if (skillResult.length === 0) {
            const [newSkill] = await db.execute(
              'INSERT INTO skills (name, category) VALUES (?, ?)',
              [skillName, 'Général']
            );
            skillResult = [{ id: newSkill.insertId }];
          }

          // Lier la compétence à la mission
          await db.execute(
            'INSERT INTO mission_skills (mission_id, skill_id) VALUES (?, ?)',
            [missionId, skillResult[0].id]
          );
        }
      }

      await db.commit();

      res.status(201).json({
        success: true,
        message: 'Mission créée avec succès',
        data: { id: missionId }
      });

    } catch (error) {
      await db.rollback();
      throw error;
    }

  } catch (error) {
    console.error('Erreur lors de la création de la mission:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la création de la mission'
    });
  }
});

// Mettre à jour une mission
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      category,
      budgetMin,
      budgetMax,
      budgetType,
      currency,
      deadline,
      status,
      isRemote,
      location,
      experienceLevel,
      skillsRequired
    } = req.body;

    // Vérifier que la mission existe
    const [existingMission] = await db.execute('SELECT * FROM missions WHERE id = ?', [id]);
    
    if (existingMission.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mission non trouvée'
      });
    }

    await db.beginTransaction();

    try {
      // Mise à jour de la mission
      await db.execute(
        `UPDATE missions SET 
         title = COALESCE(?, title),
         description = COALESCE(?, description),
         category = COALESCE(?, category),
         budget_min = COALESCE(?, budget_min),
         budget_max = COALESCE(?, budget_max),
         budget_type = COALESCE(?, budget_type),
         currency = COALESCE(?, currency),
         deadline = COALESCE(?, deadline),
         status = COALESCE(?, status),
         is_remote = COALESCE(?, is_remote),
         location = COALESCE(?, location),
         experience_level = COALESCE(?, experience_level),
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [title, description, category, budgetMin, budgetMax, budgetType, currency, deadline, status, isRemote, location, experienceLevel, id]
      );

      // Mise à jour des compétences si fournies
      if (skillsRequired) {
        // Supprimer les anciennes compétences
        await db.execute('DELETE FROM mission_skills WHERE mission_id = ?', [id]);

        // Ajouter les nouvelles compétences
        for (const skillName of skillsRequired) {
          let [skillResult] = await db.execute('SELECT id FROM skills WHERE name = ?', [skillName]);
          
          if (skillResult.length === 0) {
            const [newSkill] = await db.execute(
              'INSERT INTO skills (name, category) VALUES (?, ?)',
              [skillName, 'Général']
            );
            skillResult = [{ id: newSkill.insertId }];
          }

          await db.execute(
            'INSERT INTO mission_skills (mission_id, skill_id) VALUES (?, ?)',
            [id, skillResult[0].id]
          );
        }
      }

      await db.commit();

      res.json({
        success: true,
        message: 'Mission mise à jour avec succès'
      });

    } catch (error) {
      await db.rollback();
      throw error;
    }

  } catch (error) {
    console.error('Erreur lors de la mise à jour de la mission:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour de la mission'
    });
  }
});

// Supprimer une mission
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier que la mission existe
    const [existingMission] = await db.execute('SELECT * FROM missions WHERE id = ?', [id]);
    
    if (existingMission.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mission non trouvée'
      });
    }

    await db.execute('DELETE FROM missions WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Mission supprimée avec succès'
    });

  } catch (error) {
    console.error('Erreur lors de la suppression de la mission:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression de la mission'
    });
  }
});

// Changer le statut d'une mission
router.patch('/:id/status', auth, async (req, res) => {
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

    const [result] = await db.execute(
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
      message: 'Statut de la mission mis à jour avec succès'
    });

  } catch (error) {
    console.error('Erreur lors du changement de statut:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du changement de statut'
    });
  }
});

// Signaler une mission
router.post('/:id/report', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'La raison du signalement est obligatoire'
      });
    }

    // Vérifier que la mission existe
    const [existingMission] = await db.execute('SELECT * FROM missions WHERE id = ?', [id]);
    
    if (existingMission.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Mission non trouvée'
      });
    }

    // Vérifier si déjà signalée par cet utilisateur
    const [existingReport] = await db.execute(
      'SELECT * FROM mission_reports WHERE mission_id = ? AND reporter_id = ?',
      [id, req.user.id]
    );

    if (existingReport.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Vous avez déjà signalé cette mission'
      });
    }

    await db.execute(
      'INSERT INTO mission_reports (mission_id, reporter_id, reason) VALUES (?, ?, ?)',
      [id, req.user.id, reason]
    );

    res.json({
      success: true,
      message: 'Mission signalée avec succès'
    });

  } catch (error) {
    console.error('Erreur lors du signalement:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du signalement'
    });
  }
});

// Récupérer les statistiques des missions
router.get('/stats/overview', auth, async (req, res) => {
  try {
    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total_missions,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_missions,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_missions,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_missions,
        COUNT(DISTINCT mr.mission_id) as reported_missions,
        AVG(budget_max) as average_budget
      FROM missions m
      LEFT JOIN mission_reports mr ON m.id = mr.mission_id
    `);

    res.json({
      success: true,
      data: stats[0]
    });

  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des statistiques'
    });
  }
});

module.exports = router;