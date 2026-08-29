# Tablero Corporativo · Academia Movida SST

Portal privado para empresas clientes de la Academia Movida SST. Permite consultar el avance de los empleados matriculados en cursos corporativos sin exponer información de otras empresas.

## Arquitectura

- **Frontend:** GitHub Pages (`tablero.movidasst.com`).
- **Autenticación:** Supabase Auth.
- **Autorización empresarial:** `academia_empresa_usuarios`.
- **Datos comerciales/académicos:** tablas `academia_empresas`, `academia_contratos`, `academia_cursos_empresa` y `academia_participantes_empresa` ya utilizadas por Gestión.
- **Lectura Moodle:** Edge Function `tablero-empresa` con token de lectura Moodle en el servidor.
- **Administración de accesos:** Edge Function `tablero-admin`, limitada a usuarios activos de `estudio_admins` con rol `admin`.
- **Cache:** `academia_empresa_reportes_cache`, 10 minutos por empresa/curso/criterio de inactividad.
- **Auditoría:** `academia_empresa_portal_auditoria`.

## Seguridad

El navegador no puede consultar directamente las tablas empresariales: RLS está habilitado y no existen políticas de lectura para `anon` o `authenticated`. Toda consulta pasa por la Edge Function, que resuelve las empresas autorizadas desde el `auth_user_id` de la sesión.

Un usuario puede tener acceso a una o varias empresas, pero solo recibe información de las empresas asociadas en `academia_empresa_usuarios`.

## Flujo administrativo

1. Crear empresa, contrato y curso empresarial en **Gestión**.
2. Importar participantes y matricularlos en Moodle desde Gestión.
3. Entrar en `/admin.html` del Tablero con una cuenta administrativa.
4. Seleccionar empresa, indicar correo del cliente y enviar invitación.
5. El cliente define su contraseña y entra al portal.

## Información visible al cliente

- participantes y matrículas;
- cursos contratados;
- actividad reciente / inactividad / nunca ingresó;
- progreso por actividades;
- actividades pendientes;
- calificación acumulada;
- asistencia del grupo empresarial;
- completados;
- alertas de seguimiento;
- resumen por curso;
- exportación CSV;
- informe imprimible/guardable como PDF.

## Archivos principales

- `index.html`: portal del cliente.
- `app.js`: autenticación, consulta y render del tablero.
- `admin.html`: administración de accesos empresariales.
- `admin.js`: invitaciones, suspensión, roles y recuperación.
- `config.js`: URL de Supabase y publishable key.
- `styles.css`: interfaz responsive/mobile-first.
- `CNAME`: `tablero.movidasst.com`.

## Requisitos de Supabase Auth

Las URL de redirección deben permitir al menos:

- `https://tablero.movidasst.com/`
- `https://tablero.movidasst.com/?invite=1`
- `https://tablero.movidasst.com/?reset=1`

Para pruebas antes de activar el dominio se puede autorizar también `https://movidasst.github.io/tablero/`.

## Principio de diseño

**Gestión administra; Tablero informa.** El portal del cliente es de solo lectura sobre la operación académica y no puede matricular, desmatricular, crear cursos ni modificar datos de otras empresas.
