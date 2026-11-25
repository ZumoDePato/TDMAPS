# TDMAPS

Puente entre Claude y la API de autobuses de la EMT de Madrid (MobilityLabs). Es un servidor MCP sin dependencias que se publica en Vercel y se añade a Claude como conector.

## Herramientas

- `paradas_cercanas`: paradas cerca de unas coordenadas, con sus líneas.
- `llegadas`: minutos de llegada en tiempo real a una parada y posición de cada bus.
- `info_parada`: nombre, dirección, líneas, frecuencias y horarios de una parada.

## Puesta en marcha en Vercel

1. En el proyecto de Vercel, ve a **Settings → Environment Variables** y añade:
   - `EMT_EMAIL`: el correo de tu cuenta de MobilityLabs.
   - `EMT_PASSWORD`: la contraseña de MobilityLabs.
   - `MCP_KEY`: una clave inventada y larga (por ejemplo, 30 letras y números al azar). Protege el servidor para que solo tú puedas usarlo.
2. Vuelve a desplegar: **Deployments → … → Redeploy**.
3. Abre `https://TU-PROYECTO.vercel.app/mcp?key=TU_MCP_KEY` en el navegador. Si ves `"servidor":"tdmaps-emt"`, está funcionando.
4. En Claude, añade un conector personalizado con esa misma URL.

Las credenciales solo viven en Vercel; nunca se guardan en este repositorio.
