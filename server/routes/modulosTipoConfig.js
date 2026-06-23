const modulosTipoConfigService = require('../services/modulosTipoConfigService');

module.exports = function registerModulosTipoConfigRoutes(app, db, authenticateToken) {
  app.get('/api/config/modulos-tipo', authenticateToken, async (req, res) => {
    try {
      const map = await modulosTipoConfigService.getAllModulosTipo(db);
      res.json(map);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put('/api/config/modulos-tipo/:moduloId', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores' });
    }
    try {
      const { tipo_setor } = req.body || {};
      const result = await modulosTipoConfigService.setModuloTipo(
        db,
        req.params.moduloId,
        tipo_setor
      );
      res.json(result);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });
};
