---
name: domain-glossary
description: Glosario de dominio y archivo de definiciones. Úsalo cuando el usuario pida entender terminología desconocida a partir de documentación, resúmenes, notas o preparaciones de reuniones, con sinónimos documentales y menciones exactas en fuentes.
---

# Glosario de dominio

Crea un glosario trazable para que una persona nueva en el dominio entienda la
terminología usada por el proyecto. Trabaja en el idioma del usuario.

## Entradas

Respeta la ruta y el formato pedidos. Si no se indica ruta, crea `Glosario.md`
en la raíz documental del proyecto. Pregunta solo cuando el alcance o el destino
sean realmente ambiguos.

## Proceso

1. Haz un inventario de las fuentes relevantes: documentación funcional y técnica,
   anexos, resúmenes, estado vigente, notas y preparaciones de reuniones. Prefiere
   la copia canónica cuando existan duplicados. **Fin:** corpus identificado y
   alcance o destino confirmados.
2. Para ingerir fuentes aplica [lectura documental](../lectura-documental/SKILL.md):
   lectura directa o rama de conversión temporal. Termina con cada fuente clasificada
   y los temporales propios limpios o su fallo declarado.
3. Al extraer afirmaciones y registrar límites aplica
   [fuentes y evidencias](../operativa-comun/references/fuentes-evidencias.md).
   **Fin:** cada afirmación utilizable tiene original y localizador.
4. Extrae términos que una persona nueva necesite para comprender el dominio,
   sus procesos, cálculos, datos, sistemas internos y siglas. Excluye vocabulario
   trivial y términos genéricos de ingeniería que no tengan un significado
   específico en el proyecto. **Fin:** conceptos relevantes identificados.
5. Normaliza una forma canónica por concepto. Agrupa abreviaturas, grafías y
   traducciones solo cuando las fuentes permitan tratarlas como variantes.
   Mantén separados los conceptos relacionados que no sean sinónimos. **Fin:**
   cada agrupación tiene fundamento documental o etiqueta de inferencia.
6. Define cada término en el contexto del proyecto. Señala expresamente las
   inferencias, ambigüedades, conflictos y siglas no desarrolladas. Conserva como
   desconocidas las expansiones sin fuente y distingue ejemplos de reglas
   contractuales. **Fin:** una definición por concepto con su evidencia o límite.
7. Ordena alfabéticamente y escribe el archivo con secciones, sin tablas.
   **Fin:** cumple la verificación de abajo.

## Formato de salida

Usa una sección por letra y una subsección por término:

```markdown
# Glosario de <dominio>

Breve nota sobre alcance, autoridad y limitaciones de las definiciones.

## A

### Acrónimo o término

**Definición:** significado claro dentro del proyecto y distinciones necesarias.

**Sinónimos o variantes documentales:** variantes que aparecen realmente en las fuentes.

**Mención en fuentes:** [source: ruta#sección, líneas X-Y]
```

Omite `Sinónimos o variantes documentales` cuando no existan. Conserva siempre
`Definición` y `Mención en fuentes`.

## Trazabilidad

Cita junto a cada entrada con el formato propio de esta skill y los localizadores
de fuentes y evidencias; para conversiones sigue lectura documental. Cada
definición y variante debe conservar su mención comprobable.

## Criterios de calidad

- Define primero el uso documental; añade conocimiento general solo para hacerlo
  comprensible y sin contradecir las fuentes.
- Distingue instrumento, dato, resultado, proceso, sistema y área organizativa.
- Distingue términos próximos, por ejemplo tasa y factor, fixing e implícito,
  principal y saldo vivo, instrumento y resultado calculado.
- Conserva las erratas o nombres extraños únicamente como variantes y explica su
  condición.
- Mantén una cobertura amplia del dominio sin convertir el archivo en un
  inventario de todas las palabras de los documentos.

## Verificación

Termina solo cuando:

1. Cada encabezado de término tiene exactamente una definición y al menos una
   mención localizable en fuentes.
2. Todos los sinónimos o variantes aparecen en la documentación o están marcados
   como inferencia.
3. Los conceptos relacionados pero no equivalentes permanecen diferenciados.
4. Las entradas están ordenadas alfabéticamente y el archivo no contiene tablas.
5. Las limitaciones de lectura y las fuentes no verificadas están declaradas sin
   atribuirles contenido.
