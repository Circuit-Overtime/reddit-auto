#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, 'src', '.env');

const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};

envContent.split('\n').forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
        const [key, value] = line.split('=');
        envVars[key.trim()] = value.trim();
    }
});

const githubToken = envVars.GITHUB_TOKEN;
const pollinationsToken = envVars.POLLINATIONS_TOKEN;

if (!githubToken || !pollinationsToken) {
    console.error('Missing required tokens in .env file');
    process.exit(1);
}

console.log('Setting app secrets from .env...');

try {
    console.log('Setting github_token...');
    execSync(`echo "${githubToken}" | npx devvit settings set github_token`, {
        stdio: 'inherit',
        cwd: __dirname,
    });

    console.log('Setting polli_token...');
    execSync(`echo "${pollinationsToken}" | npx devvit settings set polli_token`, {
        stdio: 'inherit',
        cwd: __dirname,
    });

    console.log('✅ Secrets configured successfully!');
} catch (error) {
    console.error('❌ Failed to set secrets:', error.message);
    process.exit(1);
}
