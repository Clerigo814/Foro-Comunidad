# Nébula — foro comunitario

Proyecto base funcional con Node.js + Express + SQLite.

## Ejecutar
1. Instala Node.js 20+.
2. En esta carpeta ejecuta `npm install`.
3. Define `SESSION_SECRET` con una clave larga y aleatoria.
4. Ejecuta `npm start`.
5. Abre `http://localhost:3000`.

## Producción
Antes de publicar:
- Cambiar el secreto de sesión.
- Usar HTTPS.
- Hashear contraseñas con Argon2/bcrypt.
- Añadir CSRF/rate limiting.
- Configurar almacenamiento de imágenes (S3/R2/etc.) con validación MIME, tamaño y antivirus.
- Añadir panel de moderación con roles.
- Implementar controles de edad/consentimiento y un procedimiento de retirada de contenido.
- Revisar términos, privacidad y legislación aplicable a la jurisdicción donde opere el sitio.

La interfaz está deliberadamente preparada como foro de comunidad y no incluye material sexual explícito.
