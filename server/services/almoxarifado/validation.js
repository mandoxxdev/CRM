/**
 * Validação de entrada das rotas do almoxarifado (padrão decidido em 2026-08-03).
 *
 * Uso:
 *   const { z } = require('zod');
 *   const { validate } = require('../services/almoxarifado/validation');
 *   app.post('/api/almoxarifado/exemplo', validate(ExemploSchema), handler);
 *
 * Em caso de payload inválido responde 400 no formato da casa ({ error }),
 * citando o caminho de cada campo (ex.: "itens.0.quantidade: ..."). Em caso
 * válido, substitui req.body pelo resultado parseado (aplica defaults/coerções
 * do schema). Mensagens por campo podem ser customizadas no próprio schema:
 *   z.number().gt(0, 'quantidade deve ser maior que zero')
 */

function formatZodError(error) {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  }).join('; ');
}

function validate(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: `Dados inválidos — ${formatZodError(parsed.error)}` });
    }
    req.body = parsed.data;
    next();
  };
}

module.exports = { validate, formatZodError };
