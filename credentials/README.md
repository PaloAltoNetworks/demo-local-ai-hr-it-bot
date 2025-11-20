# Credentials Folder

This folder stores sensitive authentication files for various services:
- GCP service account JSON files
- AWS credentials
- Azure credentials
- Other API keys and certificates

## Security

All files in this folder are ignored by Git (see `.gitignore`).

**Never commit credential files to version control!**

## Usage

Place your credential files here:
- GCP: `*.json` (service account files)
- AWS: `*.pem`, `*.key`
- Azure: `*.pem`, `*.key`

Then reference them in your `.env` file:
```
GOOGLE_APPLICATION_CREDENTIALS=./credentials/your-gcp-project.json
```

## Docker

Credentials are mounted into containers at runtime via `docker-compose.yml`:
```yaml
volumes:
  - ./credentials:/app/credentials:ro
```

The `:ro` flag ensures they're read-only within the container.
