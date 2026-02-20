import dotenv from 'dotenv';
import path from 'path';

// override: true is needed because Claude Code sets ANTHROPIC_API_KEY='' in the shell env
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
