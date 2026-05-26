# BrightSign Control

Aplicación Node.js + React para controlar:

1. **Módulos KMTronic** por UDP para relés.
2. **BrightSign** por UDP independiente para comandos `PLAY` y `STOP`.

La aplicación está preparada para el escenario de despliegue más restrictivo: **subir un único archivo JavaScript al BrightSign**.

Resultado final del build:

```txt
dist/bundle.js
```

Ese archivo contiene:

- Servidor API REST.
- Servidor web del panel React.
- Lógica UDP de KMTronic.
- Lógica UDP independiente de BrightSign.
- HTML/CSS/JS del front embebidos en el bundle.

No hay que desplegar `web/`, `public/`, `dist/web/`, CSS, JS ni HTML externos.

---

## Arquitectura funcional

```txt
Navegador
   │
   │ HTTP :8000
   ▼
Panel React embebido
   │
   │ REST :3000
   ▼
Node / Express en BrightSign
   ├── UDP KMTronic      → DEVICE_IP:DEVICE_PORT
   └── UDP BrightSign    → BRIGHTSIGN_HOST:2023
```

La parte importante es que **BrightSign Transport no usa el host del KMTronic seleccionado**.

Son dos destinos UDP distintos:

| Dominio    | Uso             | Host              |                             Puerto |
| ---------- | --------------- | ----------------- | ---------------------------------: |
| KMTronic   | Relés 1-8       | `DEVICE_IP`       | `DEVICE_PORT`, por defecto `12345` |
| BrightSign | `PLAY` / `STOP` | `BRIGHTSIGN_HOST` |                             `2023` |

---

## Arquitectura de build

```txt
React + Vite
     │
     │ vite-plugin-singlefile
     ▼
dist/web/index.html
     │
     │ esbuild loader .html = text
     ▼
main.js importa el HTML como string
     │
     │ esbuild format=cjs target=node14
     ▼
dist/bundle.js
     │
     ▼
BrightSign ejecuta un único archivo JS
```

No se genera `generatedHtml.js`. El HTML se incrusta directamente con `esbuild` usando:

```js
loader: {
  '.html': 'text'
}
```

---

## Funcionamiento de la aplicación

La app levanta dos servidores Express en el mismo proceso Node:

| Servicio | Puerto por defecto | Uso                                   |
| -------- | -----------------: | ------------------------------------- |
| API REST |             `3000` | Estado, relés y transporte BrightSign |
| Web UI   |             `8000` | Panel React de control                |

Accesos habituales:

```txt
http://IP_DEL_BRIGHTSIGN:8000
http://IP_DEL_BRIGHTSIGN:3000/health
http://IP_DEL_BRIGHTSIGN:3000/api/devices
http://IP_DEL_BRIGHTSIGN:3000/api/brightsign
```

El front calcula automáticamente la URL de API usando la IP desde la que se ha abierto el panel:

```txt
http://IP_DEL_BRIGHTSIGN:3000/api
```

---

## Flujo KMTronic

1. El backend registra los KMTronic configurados.
2. Se crea una instancia `Kmtronic` por cada device registrado.
3. Se inicia un servidor UDP para KMTronic.
4. El backend ejecuta un poll secuencial sobre los devices.
5. Cada respuesta UDP se guarda en la instancia correspondiente.
6. El front carga `/api/devices` al arrancar.
7. El usuario selecciona un KMTronic en el `select`.
8. El front muestra 8 botones de relé del KMTronic seleccionado.
9. Cada 10 segundos, el front consulta el estado del KMTronic seleccionado.
10. Si el usuario pulsa un relé, el front llama a la API REST.
11. La API envía el comando UDP al KMTronic.
12. El KMTronic responde con el estado completo de 8 dígitos.
13. La API parsea ese estado y lo devuelve al front.
14. El front actualiza el feedback de los 8 botones.

---

## Flujo BrightSign PLAY / STOP

1. El front muestra un componente `BrightSignTransportControls` independiente del selector KMTronic.
2. Al pulsar `PLAY` o `STOP`, el front llama a:

```http
POST /api/brightsign/transport
Content-Type: application/json

{
  "command": "PLAY"
}
```

3. El backend valida el comando.
4. `BrightSignController` envía un paquete UDP independiente a:

```txt
BRIGHTSIGN_HOST:BRIGHTSIGN_PORT
```

Por defecto:

```txt
127.0.0.1:2023
```

5. La respuesta REST confirma el envío.

Comandos permitidos:

| Comando | Payload UDP |
| ------- | ----------- |
| PLAY    | `PLAY`      |
| STOP    | `STOP`      |

---

## Estado KMTronic

El KMTronic devuelve un payload de 8 dígitos:

```txt
01001001
```

Cada posición representa un relé:

| Dígito |   Relé |
| -----: | -----: |
|      1 | Relé 1 |
|      2 | Relé 2 |
|      3 | Relé 3 |
|      4 | Relé 4 |
|      5 | Relé 5 |
|      6 | Relé 6 |
|      7 | Relé 7 |
|      8 | Relé 8 |

Valores:

| Valor | Estado            |
| ----- | ----------------- |
| `0`   | OFF / desactivado |
| `1`   | ON / activado     |

---

## Estructura relevante

```txt
.
├── main.js                                  # Entrada Node/Express/UDP
├── package.json                             # Scripts pnpm
├── scripts/
│   └── build.cjs                            # Build completo: Vite + esbuild
├── src/
│   ├── BrightSignController.js              # UDP independiente BrightSign PLAY/STOP
│   ├── DeviceManager.js                     # Registro y poll secuencial KMTronic
│   ├── UDPServer.js                         # Servidor UDP KMTronic
│   ├── config.js                            # Variables de entorno y valores por defecto
│   ├── html.js                              # Carga/incrustacion del HTML React
│   ├── devices/
│   │   └── Kmtronic.js                      # Lógica de cada KMTronic
│   └── routes/
│       └── devices.js                       # API REST
├── vite.config.mjs                          # Config Vite + viteSingleFile()
├── web/
│   ├── index.html                           # Entrada HTML de Vite
│   └── src/
│       ├── App.jsx                          # App React
│       ├── styles.css                       # Estilos
│       └── components/
│           ├── RelayToggle.jsx              # Botón de relé reutilizable
│           └── BrightSignTransportControls.jsx
└── dist/
    ├── web/index.html                       # Intermedio generado por Vite
    └── bundle.js                            # Único archivo para BrightSign
```

`dist/web/index.html` es un artefacto intermedio del build. No se despliega en BrightSign.

---

## Scripts

### Instalar dependencias

```bash
pnpm install
```

### Desarrollo backend

```bash
pnpm run dev
```

Arranca `main.js` directamente. Para que sirva el panel React real, antes debe existir:

```txt
dist/web/index.html
```

Puedes generarlo con:

```bash
pnpm run build:web
```

### Desarrollo front React con Vite

```bash
pnpm run dev:web
```

Sirve para trabajar UI con hot reload.

### Build solo del front

```bash
pnpm run build:web
```

Genera:

```txt
dist/web/index.html
```

Ese HTML queda autocontenido gracias a `vite-plugin-singlefile`.

### Build completo para BrightSign

```bash
pnpm run build
```

Este comando ejecuta todo el pipeline:

1. Ejecuta `pnpm run build:web`.
2. Vite genera `dist/web/index.html` con JS y CSS inline.
3. `esbuild` empaqueta `main.js`.
4. `esbuild` importa `dist/web/index.html` como texto usando el loader `.html`.
5. Se genera `dist/bundle.js` en CommonJS compatible con Node 14.

### Ejecutar bundle final localmente

```bash
pnpm run start:dist
```

Equivale a:

```bash
node dist/bundle.js
```

---

## Configuración de puertos y hosts

Valores por defecto:

```txt
API_PORT=3000
WEB_PORT=8000
UDP_PORT=12345
HOST=0.0.0.0
POLL_MS=30000
POLL_DELAY_MS=500
DEVICE_ID=kmtronic-1
DEVICE_IP=192.168.0.115
DEVICE_PORT=12345
BRIGHTSIGN_HOST=127.0.0.1
BRIGHTSIGN_PORT=2023
```

### Variables KMTronic

| Variable      | Valor por defecto | Descripción                       |
| ------------- | ----------------- | --------------------------------- |
| `DEVICE_ID`   | `kmtronic-1`      | Identificador del módulo de relés |
| `DEVICE_IP`   | `192.168.0.115`   | IP del KMTronic                   |
| `DEVICE_PORT` | `12345`           | Puerto UDP del KMTronic           |

### Variables BrightSign

| Variable          | Valor por defecto | Descripción                        |
| ----------------- | ----------------- | ---------------------------------- |
| `BRIGHTSIGN_HOST` | `127.0.0.1`       | IP destino para `PLAY` / `STOP`    |
| `BRIGHTSIGN_PORT` | `2023`            | Puerto UDP destino para BrightSign |

Si el proceso Node corre dentro del propio BrightSign y el receptor UDP está en la misma unidad, normalmente `127.0.0.1:2023` es correcto.

Si el destino es otro BrightSign de la red:

```bash
BRIGHTSIGN_HOST=192.168.0.80 BRIGHTSIGN_PORT=2023 node bundle.js
```

Ejemplo con KMTronic y BrightSign externo:

```bash
DEVICE_IP=192.168.0.115 DEVICE_PORT=12345 BRIGHTSIGN_HOST=192.168.0.80 node bundle.js
```

---

## API REST

### Health API

```http
GET /health
```

Ejemplo:

```txt
http://IP_DEL_BRIGHTSIGN:3000/health
```

Devuelve también la configuración BrightSign activa.

### Listar KMTronic

```http
GET /api/devices
```

Devuelve los devices registrados y su último estado conocido.

### Estado de un KMTronic

```http
GET /api/device/:id/status
```

Devuelve el último estado guardado en memoria. No fuerza un poll UDP.

### Query UDP manual KMTronic

```http
POST /api/device/:id/query
```

Lanza un query UDP al KMTronic y devuelve el estado completo parseado.

### Cambiar un relé KMTronic

```http
POST /api/device/:id/relay/:relay
Content-Type: application/json

{
  "state": true
}
```

Donde:

| Campo   | Tipo      | Descripción                |
| ------- | --------- | -------------------------- |
| `relay` | `1..8`    | Número de relé             |
| `state` | `boolean` | `true` = ON, `false` = OFF |

La respuesta devuelve el estado completo actualizado del KMTronic.

### Configuración BrightSign

```http
GET /api/brightsign
```

Ejemplo de respuesta:

```json
{
  "host": "127.0.0.1",
  "port": 2023,
  "protocol": "udp",
  "commands": ["PLAY", "STOP"]
}
```

### Enviar PLAY / STOP a BrightSign

```http
POST /api/brightsign/transport
Content-Type: application/json

{
  "command": "PLAY"
}
```

Respuesta:

```json
{
  "ok": true,
  "target": "brightsign",
  "command": "PLAY",
  "host": "127.0.0.1",
  "port": 2023,
  "sentAt": "2026-05-24T10:00:00.000Z"
}
```

También existe endpoint directo opcional:

```http
POST /api/brightsign/PLAY
POST /api/brightsign/STOP
```

---

## Despliegue en BrightSign

### 1. Compilar en el PC de desarrollo

```bash
pnpm install
pnpm run build
```

Comprueba que existe:

```txt
dist/bundle.js
```

### 2. Copiar al BrightSign

Copia solo este archivo:

```txt
dist/bundle.js
```

Puedes renombrarlo en destino como:

```txt
bundle.js
```

### 3. Ejecutar en BrightSign

Si lo has copiado como `bundle.js`:

```bash
node bundle.js
```

Si mantienes la carpeta `dist`:

```bash
node dist/bundle.js
```

### 4. Comprobar API

```txt
http://IP_DEL_BRIGHTSIGN:3000/health
```

Respuesta esperada:

```json
{
  "ok": true,
  "service": "brightsign-api",
  "devices": 1,
  "brightsign": {
    "host": "127.0.0.1",
    "port": 2023,
    "protocol": "udp",
    "commands": ["PLAY", "STOP"]
  }
}
```

### 5. Comprobar panel web

```txt
http://IP_DEL_BRIGHTSIGN:8000
```

El panel debe cargar sin archivos externos.

---

## Checklist de red

1. BrightSign y KMTronic deben tener conectividad IP.
2. El proceso Node debe poder enviar UDP al KMTronic.
3. El proceso Node debe poder enviar UDP al destino BrightSign `BRIGHTSIGN_HOST:2023`.
4. El navegador debe poder acceder al BrightSign por TCP `8000` y `3000`.
5. Abrir puertos si hay firewall/VLAN:
   - TCP `8000` para web.
   - TCP `3000` para API.
   - UDP `DEVICE_PORT` para KMTronic.
   - UDP `2023` para BrightSign Transport.
6. `DEVICE_IP` debe ser la IP real del KMTronic.
7. `BRIGHTSIGN_HOST` debe ser la IP del BrightSign receptor o `127.0.0.1` si es el propio equipo.

---

## Diagnóstico rápido

### El panel no carga

Comprueba:

```txt
http://IP_DEL_BRIGHTSIGN:8000/health
```

Si responde, el servidor web está vivo.

### La API no responde

Comprueba:

```txt
http://IP_DEL_BRIGHTSIGN:3000/health
```

Si no responde, revisar que el proceso Node esté ejecutándose.

### Carga el panel pero no aparecen KMTronic

Comprueba:

```txt
http://IP_DEL_BRIGHTSIGN:3000/api/devices
```

Debe devolver al menos `kmtronic-1`.

### PLAY / STOP no funcionan

Comprueba:

```txt
http://IP_DEL_BRIGHTSIGN:3000/api/brightsign
```

Verifica que `host` y `port` sean correctos.

Después prueba:

```bash
curl -X POST http://IP_DEL_BRIGHTSIGN:3000/api/brightsign/transport \
  -H "Content-Type: application/json" \
  -d '{"command":"PLAY"}'
```

Si la API responde `ok: true`, el paquete UDP se ha enviado. Si el BrightSign no reacciona, revisar que el receptor UDP esté escuchando en `2023` y que el payload esperado sea exactamente `PLAY`/`STOP`.

---

## Notas de implementación

- `UDPServer.js` queda dedicado al flujo KMTronic.
- `config.js` concentra las variables de entorno y valores por defecto.
- `html.js` permite incrustar el HTML single-file dentro de `dist/bundle.js`.
- `BrightSignController.js` usa un socket UDP independiente para `PLAY`/`STOP`.
- El selector del front solo afecta a los relés KMTronic.
- Los botones `PLAY` y `STOP` no dependen del KMTronic seleccionado.
- El bundle final sigue siendo un único `.js`.
