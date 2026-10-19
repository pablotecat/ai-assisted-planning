---
name: lectura-documental
description: Lee fuentes documentales cuando haya Markdown o texto, conversiones MarkItDown a salida estándar o conversiones temporales para glosarios y reuniones.
---

# Lectura documental

1. Lee Markdown y texto directamente. Para otros formatos compatibles, comprueba `markitdown --version`; consulta `markitdown --help` si necesitas confirmar la interfaz. Identifica cada fuente original y el método usado antes de atribuirle contenido.
2. Elige la rama de conversión según el consumidor y sus permisos. Sigue también [fuentes y evidencias](../operativa-comun/references/fuentes-evidencias.md) al usar el contenido. Cierra la ingesta cuando cada fuente tenga estado de lectura y localizador original.

## Salida estándar — Lector Documentación

Ejecuta `markitdown "<ruta local>"` y analiza la salida completa, continuando las lecturas truncadas cuando sea posible. Esta rama no crea archivos convertidos ni temporales. Si la salida no puede recuperarse completa, declara la lectura parcial y su efecto sobre la respuesta.

## Conversión temporal — glosarios y reuniones

1. Crea una salida única en la carpeta temporal propia del proceso y ejecuta `markitdown "<fuente>" -o "<temporal>.md"`, con rutas entre comillas. Para `domain-glossary`, usa un temporal propio del proyecto; para `meeting-coach`, usa `data/.tmp/meeting-coach/<meeting-id>/`.
2. Lee la conversión completa, por partes si se trunca. Registra original, estado, MarkItDown y versión, pérdidas y limitaciones en el registro del proceso (`sources.md` en reuniones).
3. Elimina solo los temporales propios antes de terminar. Si la limpieza falla, comunica su ruta restante. La rama termina con cada fuente clasificada y sin temporales propios, o con el fallo de limpieza declarado.

## Pérdidas y excepciones

Una conversión fallida, parcial o ilegible no cuenta como fuente leída completa. Registra pérdidas de fórmulas, imágenes, hojas, comentarios o localizadores y las fuentes inaccesibles; continúa con las válidas dejando explícita la cobertura pendiente. Cita siempre el original, nunca el temporal: ruta y sección, página, tabla, hoja/celdas o líneas conservadas; sin localizador estable, indica el disponible y la limitación.

Los consentimientos de instalaciones y servicios externos de `meeting-coach` se aplican en su propia rama antes de convertir. Esta skill no amplía permisos ni impone esos consentimientos a los demás consumidores.
