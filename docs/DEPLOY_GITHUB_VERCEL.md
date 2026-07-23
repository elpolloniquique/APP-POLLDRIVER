# Despliegue PollDriver (GitHub + Vercel)

## Resumen

| Pieza | Dónde |
|-------|--------|
| Código | Repo GitHub (ej. `polldriver`) |
| Admin web | **Vercel** (SPA Vite, puerto local 5174) |
| Base de datos | **Mismo Supabase** que El Pollón (no se despliega en Vercel) |
| SQL `pd_*` | Se ejecuta a mano en Supabase SQL Editor |

Las migraciones **no** las corre Vercel: hay que pegarlas en Supabase (001→011).

---

## 1. GitHub (primera vez)

```powershell
cd "c:\APP POLLON\polldriver"
git init
git add .
git commit -m "chore: initial PollDriver admin + migrations"
```

Crear repo vacío en GitHub (sin README) y:

```powershell
git remote add origin https://github.com/TU_USUARIO/polldriver.git
git branch -M main
git push -u origin main
```

**Nunca** subas `.env.local` (ya está en `.gitignore`).

---

## 2. Vercel

1. Entra a [vercel.com](https://vercel.com) → **Add New Project** → importa el repo `polldriver`.
2. Ajustes del proyecto:
   - **Framework:** Vite (o detectado)
   - **Root Directory:** `.` (raíz del monorepo)
   - **Install:** `pnpm install` (viene en `vercel.json`)
   - **Build:** `pnpm build:admin`
   - **Output:** `apps/admin-web/dist`
3. **Environment Variables** (Production + Preview):

| Nombre | Valor |
|--------|--------|
| `VITE_SUPABASE_URL` | Misma URL que El Pollón |
| `VITE_SUPABASE_ANON_KEY` | Misma anon key (pública del cliente) |
| `VITE_EL_POLLON_URL` | `https://el-pollon.cl` (opcional) |
| `VITE_APP_NAME` | `PollDriver` (opcional) |

4. Deploy → te da una URL tipo `https://polldriver-xxx.vercel.app`.

SPA: `vercel.json` ya reescribe rutas a `index.html` (`/login`, `/postular`, etc.).

---

## 3. CLI (alternativa)

```powershell
npm i -g vercel
cd "c:\APP POLLON\polldriver"
vercel login
vercel link
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
vercel --prod
```

---

## 4. Después de cada push

Si el proyecto está conectado a GitHub, cada push a `main` redespliega solo.

Local:

```powershell
git add .
git commit -m "mensaje"
git push
```

---

## 5. Checklist post-deploy

- [ ] Abrir la URL de Vercel → login staff funciona  
- [ ] `/postular` carga  
- [ ] SQL 001→011 ejecutado en Supabase  
- [ ] En Supabase Auth → URL Configuration: agregar dominio Vercel a **Redirect URLs** / Site URL si usas magic links  
- [ ] Probar CORS no aplica (Supabase anon desde browser ya usado en el-pollon.cl)

---

## Importante

- **No** pongas `SUPABASE_SERVICE_ROLE_KEY` ni contraseñas admin en Vercel.  
- PollDriver y El Pollón pueden ser **dos proyectos Vercel** distintos apuntando al **mismo** Supabase.
