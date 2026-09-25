# Despliegue a producción

El deploy ejecuta un SHA inmutable para API, admin, landing y PWA. Render valida la API antes de promover los candidatos de Vercel; si falla, el tráfico web anterior permanece activo.

## Ruta rápida

1. Confirma que el commit pertenece a `main` y que el environment `production` de GitHub exige aprobación.
2. Ejecuta **Deploy production** con `workflow_dispatch`.
3. Verifica el job **Production smoke checks**.
4. Conserva el SHA, los deployment IDs y la hora para rollback.

## Topología

| Superficie | Plataforma | Identidad de versión |
| --- | --- | --- |
| API | Render | `GET /api/v1/health` compara `version` con `GITHUB_SHA` |
| Admin | Vercel | metadata `githubSha` y deployment candidato |
| Landing | Vercel | metadata `githubSha` y deployment candidato |
| PWA Expo | Vercel | metadata `githubSha` y deployment candidato |

El workflow:

1. rechaza refs distintos de `main`;
2. usa `actions/checkout` con `github.sha`;
3. envía a Render `?ref=<sha>` en el deploy hook;
4. crea deployments Vercel de producción con `--skip-domain`, sin mover dominios;
5. espera que la API reporte exactamente ese SHA;
6. promueve los tres deployments Vercel;
7. ejecuta smoke checks públicos.

No existe una transacción atómica entre Render y Vercel. El orden reduce el riesgo: una API inválida no precede a la promoción web. Una promoción parcial de Vercel todavía requiere rollback inmediato.

## Configuración propiedad del operador

### GitHub Environment `production`

Configura en GitHub, no en el repositorio:

| Setting | Valor requerido |
| --- | --- |
| Required reviewers | Equipo autorizado |
| Deployment branches and tags | `main` únicamente |
| Environment secrets | Render y Vercel indicados abajo |
| Environment variables | URLs públicas indicadas abajo |

No se asume que el branch protection o el environment protection ya existan.

### Secrets

| Secret | Consumidor |
| --- | --- |
| `RENDER_DEPLOY_HOOK_URL` | GitHub → Render |
| `VERCEL_TOKEN` | GitHub → Vercel |
| `VERCEL_ORG_ID` | GitHub → Vercel |
| `VERCEL_PROJECT_ID_ADMIN` | proyecto admin |
| `VERCEL_PROJECT_ID_LANDING` | proyecto landing |
| `VERCEL_PROJECT_ID_MOBILE` | proyecto PWA |

### Variables

| Variable | Uso |
| --- | --- |
| `API_HEALTH_URL` | `https://<api>/api/v1/health` |
| `ADMIN_PUBLIC_URL` | URL pública del admin |
| `LANDING_PUBLIC_URL` | URL pública de landing |
| `PWA_PUBLIC_URL` | URL pública de la PWA |

`API_HEALTH_URL` acepta el valor legado del secret para transición, pero debe migrarse a environment variable.

## Versionado

- Render debe exponer `RENDER_GIT_COMMIT`; si no lo hace, configurar `APP_VERSION` con el mismo SHA antes del deploy.
- Vercel guarda `githubSha` como metadata del deployment. El dashboard y `vercel inspect <deployment-url>` muestran el SHA.
- La API responde sin secretos:

```json
{
  "status": "ok",
  "version": "<sha>",
  "database": "up",
  "rateLimit": { "backend": "redis", "status": "up" },
  "jobs": {
    "ordersExpiration": { "enabled": true, "intervalSeconds": 60 }
  }
}
```

## Rollback

### API

1. Identifica en Render el deploy estable anterior y su commit.
2. Ejecuta **Manual Deploy → Deploy a specific commit** con ese SHA, o usa un deploy hook con `?ref=<sha-anterior>`.
3. Espera `GET /api/v1/health` y confirma `version`.

### Admin, landing y PWA

1. Localiza el deployment anterior en Vercel.
2. Promueve el deployment anterior con `vercel promote <deployment-url> --yes`.
3. Repite el smoke check del frontend afectado.

No reutilices un artefacto generado con otro SHA. Vercel puede promover un deployment previo, pero el código restaurado debe ser el commit conocido.

## Fallo parcial

| Síntoma | Acción |
| --- | --- |
| API no alcanza el SHA esperado | No se promueven frontends; revisar Render |
| Un candidato Vercel falla | No se promueve ninguno |
| Promoción Vercel falla a mitad | Promover inmediatamente los tres deployments anteriores |
| Smoke falla después de promover | Ejecutar rollback de API y/o Vercel según dependencia |

Guarda siempre el SHA del workflow y los tres deployment URLs de los artifacts del job.

## Verificación local

```sh
bun run typecheck
bun run test --force
bun run build
bunx yaml-lint .github/workflows/deploy-production.yml render.yaml
```

La ejecución remota la realiza GitHub Actions; este documento no autoriza desplegar manualmente fuera del flujo salvo incidente documentado.
