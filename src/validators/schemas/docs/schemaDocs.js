
import { AuthSchemas } from "../validators/index.js";
import j2s from "joi-to-swagger";
import fs from "fs";

const schemas = {
  register: AuthSchemas.registerSchema,
  login: AuthSchemas.loginSchema,
  forgotPassword: AuthSchemas.forgotPasswordSchema,
  resetPassword: AuthSchemas.resetPasswordSchema,
  verifyEmail: AuthSchemas.verifyEmailSchema,
};

const swaggerSchemas = {};

for (const [key, schema] of Object.entries(schemas)) {
  const { swagger } = j2s(schema);
  swaggerSchemas[key] = swagger;
}


//to run
//node ../docs/schemaDocs.js