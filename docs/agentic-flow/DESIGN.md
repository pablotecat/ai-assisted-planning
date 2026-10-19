# Hero · Dos cadenas de montaje

## Concepto, antes de la geometría

Una pequeña línea de fabricación documental: la primera cadena lee y copia ideas, investiga preguntas concretas, recompone historias y coteja originales con la propuesta conjunta; la segunda reparte esas historias entre tres especialidades, suministra código, fabrica tareas y revisa cada rama antes de integrarlas.

La vista completa muestra todos los agentes, recorridos y almacenes sin reproducir la animación. Los nombres son visibles junto a cada máquina. La animación muestra documentos, preguntas, evidencias y tareas viajando por los transportadores.

## Recorrido solicitado

### 1. Ideas → Historias Refinadas

1. Varios documentos entran en el lector/copiador del planificador.
2. El planificador conserva originales y reparte copias entre refinadores.
3. Los refinadores plantean consultas concretas a investigadores.
4. Los investigadores usan Lector Código y Lector Documentación, que recuperan archivos del gran almacén **Fuente de Verdad**.
5. Las respuestas vuelven al investigador y después al refinador que preguntó.
6. Cada refinador deconstruye y redacta de nuevo su historia.
7. Los borradores vuelven al planificador para su revisión conjunta.
8. El revisor recibe dos entradas: originales y propuesta del planificador.
9. Las historias verificadas quedan en **Historias Refinadas**.

El lector/distribuidor y el puesto de revisión conjunta representan dos trabajos del **mismo planificador**; comparten su identificación P.

### 2. Historias Refinadas → Tareas

1. El arquitecto principal toma las historias de la pila compartida.
2. Las reparte a los arquitectos Test, Back y Front.
3. Cada especialista lee y pide fragmentos de código al proveedor.
4. El proveedor recupera esos fragmentos de la pila **Código** y los devuelve a quien los solicitó.
5. Cada especialista redacta varias tareas.
6. Hay un revisor por rama: Test, Back y Front.
7. Las tareas revisadas vuelven al arquitecto principal, que las integra y entrega.

El distribuidor y el integrador representan al **mismo arquitecto principal**, identificado A. El dibujo es la vista funcional pedida por el usuario: las tres especialidades y el proveedor participan en ella.

## Ejemplo y modelo

Tres documentos de entrada, tres refinadores, dos investigadores y tres especialidades. Cada especialidad produce tres tareas: nueve en total. Son cantidades del ejemplo visual. `model.mjs` define nodos, rutas, pasos, paquetes y existencias; tanto la animación como los contadores proceden de ese modelo.

## Distribución

- Cada fase ocupa una tarjeta independiente, con entrada a la izquierda y salida a la derecha.
- En la primera, la investigación ocupa la banda superior; los refinadores y la composición conjunta ocupan la zona central; los originales tienen un transportador propio hacia el revisor en la banda inferior.
- En la segunda, Test, Back y Front son tres ramales paralelos; proveedor y Código están arriba. Cada revisor queda a la derecha de su especialista y los retornos confluyen en el integrador.
- **Historias Refinadas** se representa igual al terminar la fase 1 y al comenzar la fase 2. Un enlace entre ambas tarjetas explica que se trata de la misma pila.
- Cámara elevada casi frontal a los ramales para que la estructura se lea con claridad. El detalle técnico queda al servicio del recorrido.

## Inventario previsto, agrupado antes de dibujar

La Hero contiene dos conjuntos; cada estación se monta sobre una zapata real y cada banda tiene altura.

| Conjunto | Piezas previstas |
|---|---|
| Lector y copiador | Zapata, caja trasera, tapa, dos apoyos de lectura, rodillo, ficha de entrada, mando y placa |
| Tres refinadores | Tres zapatas, tres cuerpos, seis guías, nueve tiras de historia que se separan y recomponen, tres mandos |
| Dos investigadores | Dos zapatas, dos distribuidores, dos selectores con escalas y coronas |
| Lector Código y Lector Documentación | Dos zapatas, dos lectores, dos tapas, dos bandejas de extracción y fichas |
| Fuente de Verdad | Pedestal, respaldo, dos laterales, tres baldas, dos separadores, nueve lotes de archivos, tapas y remaches |
| Planificador: conjunto | Zapata, cuerpo, mesa de cotejo, tres guías y pila de borradores |
| Revisor de historias | Zapata, dos lechos de comparación, dos apoyos, puente lector y placa de dictamen |
| Pilas y transportadores | Suelos, guías, documentos individuales, placas de transferencia, rodillos grabados, uniones y tornillos |
| Arquitecto principal: reparto | Zapata, lector, tapa, mando y bandeja de encargos |
| Tres arquitectos de área | Tres zapatas, tres lectores, tres mesas, seis guías y nueve fichas de tarea |
| Proveedor y Código | Zapata y distribuidor de fragmentos; archivador con pedestal, paredes, baldas y lotes de código |
| Tres revisores | Tres zapatas, seis apoyos, tres puentes lectores, tres lechos de inspección y placas |
| Arquitecto principal: integración | Zapata, cuerpo, mesa de agrupación y bandeja de salida |

## Verificación

Comprobar primero el recorrido completo y la identificación de actores; después la geometría y el acabado. Capturar ambas fases completas, consultas/respuestas, originales frente a propuesta, las tres revisiones técnicas, las dos salidas, móvil y ampliaciones 4×. Verificar que todas las rutas tienen un origen y un destino correctos y que las respuestas recorren el trayecto inverso hasta su solicitante.
