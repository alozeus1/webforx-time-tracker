import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { formatZodIssues } from './schemas';

export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          message: 'Validation failed',
          errors: formatZodIssues(error),
        });
        return;
      }
      next(error);
    }
  };
};

export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          message: 'Validation failed',
          errors: formatZodIssues(error),
        });
        return;
      }
      next(error);
    }
  };
};
