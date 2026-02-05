import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  usuario?: {
    id: string;
    email: string;
    perfil: string;
  };
}

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ erro: 'Token não fornecido' });
    }

    const secret = process.env.JWT_SECRET || 'seu-secret-super-seguro';
    const decoded = jwt.verify(token, secret) as any;

    req.usuario = {
      id: decoded.id,
      email: decoded.email,
      perfil: decoded.perfil,
    };

    next();
  } catch (error) {
    return res.status(401).json({ erro: 'Token inválido' });
  }
};

export const isAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.usuario?.perfil !== 'Diretoria' || req.usuario?.email !== 'matheus@gmp.ind.br') {
    return res.status(403).json({ erro: 'Acesso negado. Apenas administradores.' });
  }
  next();
};

