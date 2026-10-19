# Fuentes y privacidad

Antes de ingerir fuentes aplica [fuentes y evidencias](../../operativa-comun/references/fuentes-evidencias.md). Para archivos usa [lectura documental](../../lectura-documental/SKILL.md), con su rama de conversión temporal y registro en `sources.md`.

## Consentimientos antes de convertir

1. Si falta la CLI o una dependencia opcional, marca la fuente como no leída, informa al usuario y ofrece instrucciones basadas en <https://github.com/microsoft/markitdown>. Instala o actualiza solo tras aprobación explícita y si los permisos del agente lo permiten; no lo hagas por iniciativa propia.
2. Antes de pasar una URL a MarkItDown o usar plugins, Document Intelligence, Content Understanding u otro servicio externo, muestra las fuentes afectadas, servicio o destino, implicaciones de privacidad y posibles costes. Espera consentimiento explícito para esa operación concreta. La lectura de documentación pública no concede permiso para enviar una fuente privada.

**Cierre de ingesta:** cada fuente tiene estado `leída`, `parcial` o `no leída`; las afirmaciones usadas apuntan al original y los temporales propios están eliminados, o su fallo de limpieza y ruta restante quedan declarados según lectura documental.
