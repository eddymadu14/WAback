import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export const generateAccessToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES || '15m'
  });
};

export const generateRefreshToken = (userId) => {
  // create a random string (not JWT) — easier to rotate & hash
  const refreshToken = crypto.randomBytes(64).toString('hex');
  // Optionally you can also sign it with JWT_refresh secret instead:
  // const token = jwt.sign({ id: userId, t: crypto.randomBytes(8).toString('hex') }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.REFRESH_TOKEN_EXPIRES || '7d' });
  return refreshToken;
};

export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

