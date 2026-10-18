# Dos cadenas de montaje

Abre **[index-light.html](index-light.html)** o [index.html](index.html) en el navegador. Ambas páginas son autónomas y permiten cambiar entre tema claro y oscuro.

## Fase 1 · Ideas → Historias Refinadas

El planificador lee varios documentos, conserva copias originales y los reparte a los refinadores. Estos hacen consultas concretas a coordinadores, que recurren a Código y Documentación para buscar en **Fuente de Verdad**. Las respuestas vuelven a quien preguntó. Los refinadores deconstruyen y redactan las historias y las devuelven al planificador para su revisión conjunta. Un revisor coteja originales y propuesta antes de dejar la salida en **Historias Refinadas**.

Los dos puestos P son el mismo planificador: reparto y revisión del conjunto.

## Fase 2 · Historias Refinadas → Tareas

El arquitecto principal toma las historias y las reparte a Test, Back y Front. Cada especialista lee, solicita fragmentos al proveedor —que accede a **Código**— y crea varias tareas. Cada rama tiene su propio revisor. Las tareas revisadas vuelven al arquitecto principal para su integración y entrega.

Los dos puestos A son el mismo arquitecto principal: reparto e integración. La pila Historias Refinadas enlaza ambas fases.

## Interacción

- La vista inicial muestra ambas cadenas completas, con todos sus nombres y conexiones.
- **Reproducir las dos fases** recorre primero planificación y después arquitectura.
- Cada fase tiene reproducción, pausa, deslizador, vista completa y una lista de pasos seleccionables.
- El selector **1× / 2× / 4×** regula la velocidad.
- Selecciona el nombre de una máquina para conocer su trabajo y resaltar sus conexiones.
- Con el foco en la cadena: flechas para cambiar de paso, espacio para reproducir/pausar, `Home`/`End` para los extremos y Escape para salir de una selección.
- El recorrido se pausa al pasar el puntero por la cadena o al entrar con el teclado. Se suspende fuera de pantalla.
- En móvil, desliza horizontalmente cada cadena. Los pasos centran la zona correspondiente. La página conserva su ancho.
- Con movimiento reducido, los controles muestran los pasos sin reproducción automática.

El ejemplo utiliza tres documentos/historias, tres refinadores, dos coordinadores y tres tareas por especialidad: nueve tareas. Representa el recorrido funcional descrito por el usuario. Las cantidades, paquetes y salidas proceden de `model.mjs`.

## Construcción

Requiere Node.js 24 y la skill Anatomy en `~/.agents/skills/anatomy`, o su ubicación en `ANATOMY_HOME`. Ejecuta desde esta carpeta:

```sh
node build.mjs --light --audit
node build.mjs --audit
```

Los HTML generados no requieren servidor, skill ni dependencias npm para abrirse.

## Verificación

```sh
node --test model.test.mjs
node verify.mjs --light
node verify.mjs
node verify.mjs --light --phone
node verify.mjs --phone
node verify.mjs --light --animated
node verify.mjs --animated
```

Las pruebas comprueban los dos recorridos, respuestas hasta el solicitante, cotejo de originales y propuesta, revisión por especialidad, contadores, teclado, selección, movimiento reducido y reproducción encadenada. La geometría estática se audita con Anatomy; las hojas en tránsito se comprueban a 60 Hz sobre los transportadores, contra estaciones y entre sí.

```sh
node capture-scenes.mjs --light
node capture-scenes.mjs
node capture-scenes.mjs --light --phone
node capture-scenes.mjs --phone
node capture-scenes.mjs --light --motion
node capture-scenes.mjs --motion
```

Consulta [DESIGN.md](DESIGN.md) para el diseño y el inventario.
