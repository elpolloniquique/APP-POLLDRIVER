# Despliegue PollDriver (GitHub + Vercel)

**Repo:** https://github.com/elpolloniquique/APP-POLLDRIVER  

## Resumen

| Pieza | Dónde |
|-------|--------|
| Código | GitHub `APP-POLLDRIVER` (ya subido) |
| Admin web | **Vercel** (SPA Vite) |
| Base de datos | **Mismo Supabase** que El Pollón |
| SQL `pd_*` | Pegar en Supabase SQL Editor (001→017) |

---

## Vercel — importar el repo (recomendado)

1. Entra a [vercel.com/new](https://vercel.com/new)
2. **Import** → elige `elpolloniquique/APP-POLLDRIVER`
3. Ajustes (si no los toma de `vercel.json`):
   - Framework: Vite  
   - Root: `.`  
   - Install: `pnpm install`  
   - Build: `pnpm build:admin`  
   - Output: `apps/admin-web/dist`
4. **Environment Variables** (Production + Preview):

| Nombre | Valor |
|--------|--------|
| `VITE_SUPABASE_URL` | Project URL de `el-pollon-db` (Settings → API). Debe resolver en DNS. |
| `VITE_SUPABASE_ANON_KEY` | **anon public** Legacy (`eyJhbGci...`) del mismo proyecto. Debe empezar por **`eyJ`** (si empieza por `yJh` está truncada y dará Invalid API key). |
| `VITE_EL_POLLON_URL` | `https://el-pollon.cl` (opcional) |
| `VITE_APP_NAME` | `PollDriver` (opcional) |

5. **Deploy**

Rutas SPA (`/login`, `/postular`, `/ofertas`) ya están en `vercel.json`.

---

## Después de cada cambio

```powershell
cd "c:\APP POLLON\polldriver"
git add .
git commit -m "mensaje"
git push
```

Si el proyecto está conectado a GitHub, Vercel redespliega solo.

---

## Checklist post-deploy

- [ ] URL de Vercel abre el login  
- [ ] `/postular` carga  
- [ ] SQL 001→017 en Supabase  
- [ ] `/privacidad` carga  
- [ ] En Auth → Redirect URLs: agregar dominio Vercel  
- [ ] Checklist: `docs/GO_LIVE_CHECKLIST.md` 

**No** subas `SUPABASE_SERVICE_ROLE_KEY` ni contraseñas a Vercel.
