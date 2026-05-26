# Diagramas UML y documentación técnica

Este documento complementa el `README.md` principal y describe la arquitectura interna, los casos de uso y los flujos principales de funcionamiento de la aplicación KMTronic BrightSign Control.

Los diagramas están escritos en **Mermaid**, por lo que pueden visualizarse directamente en GitHub, GitLab, VS Code con extensión Mermaid, Obsidian o cualquier visor compatible.

---

## 1. Visión general de arquitectura

La aplicación se ejecuta como **un único proceso Node.js** en el BrightSign. Dentro de ese proceso se levantan dos servidores HTTP independientes y un socket UDP:

- **Servidor Web**: entrega el panel HTML en `WEB_PORT`, por defecto `8080`.
- **Servidor API REST**: expone endpoints en `API_PORT`, por defecto `3000`.
- **Servidor UDP**: envía comandos al KMTronic y recibe feedback de estado.
- **DeviceManager**: instancia y coordina los dispositivos registrados.
- **Kmtronic**: representa un dispositivo físico de 8 relés.

```mermaid
flowchart LR
    Browser[Cliente navegador] -->|HTTP GET /| WebServer[Express Web Server\nWEB_PORT 8080]
    Browser -->|REST /api/*| ApiServer[Express API Server\nAPI_PORT 3000]

    ApiServer --> Routes[deviceRoutes]
    Routes --> Manager[DeviceManager]
    Manager --> Device[Kmtronic instance]
    Device -->|send buffer| Manager
    Manager --> UDP[UDPServer\nUDP_PORT 12345]
    UDP -->|UDP command| RelayBoard[KMTronic físico\n8 relés]
    RelayBoard -->|UDP feedback 8 bits| UDP
    UDP --> Manager
    Manager --> Device

    Device -->|estado en memoria| Routes
    Routes -->|JSON estado completo| Browser
```

---

## 2. Diagrama de clases

Este diagrama refleja las clases principales del backend y sus responsabilidades.

```mermaid
classDiagram
    class UDPServer {
        -socket
        -port
        +constructor(options)
        +start()
        +send(buffer, ip, port)
        +on(event, callback)
    }

    class DeviceManager {
        -devices: Map
        -byIp: Map
        -udpServer: UDPServer
        -pollInterval
        -polling: boolean
        +constructor(udpServer)
        +add(device)
        +remove(id)
        +get(id)
        +list()
        +pollOnce(delayBetweenMs)
        +startPolling(intervalMs, delayBetweenMs)
        +stopPolling()
    }

    class Kmtronic {
        -status: string
        -relays: Array
        -send: Function
        -pendingResolve
        -pendingReject
        -pendingTimeout
        -queue: Promise
        -lastRaw: string
        -lastUpdated: string
        +constructor(config)
        +_setSendFn(fn)
        +onMessage(raw)
        +queryStatus()
        +setRelay(relay, state)
        +getStatus()
    }

    class DeviceRoutes {
        <<factory>>
        +deviceRoutes(manager)
        +GET /devices
        +GET /device/:id/status
        +POST /device/:id/query
        +POST /device/:id/relay/:relay
    }

    class ExpressApiServer {
        +use('/api', deviceRoutes)
        +GET /health
        +listen(API_PORT)
    }

    class ExpressWebServer {
        +GET /
        +GET /health
        +listen(WEB_PORT)
    }

    ExpressApiServer --> DeviceRoutes
    DeviceRoutes --> DeviceManager
    DeviceManager --> UDPServer
    DeviceManager "1" o-- "1..n" Kmtronic
    Kmtronic --> DeviceManager : usa sendFn inyectada
    ExpressWebServer --> Browser : entrega INDEX_HTML
```

### Responsabilidad de cada clase/módulo

| Elemento | Responsabilidad |
|---|---|
| `main.js` | Arranque de la aplicación. Crea API, servidor web, UDP server, manager y dispositivos registrados. |
| `UDPServer` | Abstracción del socket UDP. Envía comandos y emite mensajes recibidos. |
| `DeviceManager` | Registro central de dispositivos, resolución por IP, polling secuencial y enrutado de respuestas UDP. |
| `Kmtronic` | Estado de un dispositivo físico. Parseo de feedback de 8 bits, cola de comandos y API de control de relés. |
| `deviceRoutes` | Endpoints REST consumidos por el frontend. |
| `publicHtml.js` | HTML embebido para permitir bundle en un solo archivo con `esbuild`. |

---

## 3. Diagrama de casos de uso

Actores:

- **Usuario operador**: persona que accede al panel web y controla relés.
- **Frontend Web**: cliente HTML/JS servido por BrightSign.
- **Backend Node.js**: API REST + manager + UDP.
- **KMTronic**: placa física de relés.

```mermaid
flowchart TB
    Operator[Usuario operador]
    Frontend[Frontend Web]
    Backend[Backend Node.js]
    Board[KMTronic 8 relés]

    UC1((Abrir panel web))
    UC2((Listar devices registrados))
    UC3((Seleccionar device))
    UC4((Consultar estado actual))
    UC5((Visualizar feedback de 8 relés))
    UC6((Activar relé))
    UC7((Desactivar relé))
    UC8((Polling automático cada 10 s desde frontend))
    UC9((Polling secuencial backend))
    UC10((Actualizar estado en memoria))
    UC11((Recibir respuesta UDP confirmada))

    Operator --> UC1
    Operator --> UC3
    Operator --> UC6
    Operator --> UC7

    UC1 --> Frontend
    Frontend --> UC2
    Frontend --> UC4
    Frontend --> UC5
    Frontend --> UC8

    UC2 --> Backend
    UC4 --> Backend
    UC6 --> Backend
    UC7 --> Backend
    UC8 --> Backend
    UC9 --> Backend

    Backend --> UC10
    Backend --> UC11
    UC11 --> Board
    Board --> UC11
```

---

## 4. Secuencia de arranque de la aplicación

```mermaid
sequenceDiagram
    autonumber
    participant Main as main.js
    participant UDP as UDPServer
    participant Manager as DeviceManager
    participant Device as Kmtronic
    participant API as Express API
    participant WEB as Express Web

    Main->>UDP: new UDPServer({ port: UDP_PORT })
    Main->>Manager: new DeviceManager(udpServer)
    Main->>Device: new Kmtronic({ id, ip, port })
    Main->>Manager: add(device)
    Manager->>Device: _setSendFn(send via UDPServer)
    Main->>UDP: start()
    Main->>Manager: startPolling(POLL_MS, POLL_DELAY_MS)
    Main->>API: listen(API_PORT, HOST)
    Main->>WEB: listen(WEB_PORT, HOST)
```

### Resultado esperado

Al finalizar el arranque:

- El panel web está disponible en `http://IP_BRIGHTSIGN:8080`.
- La API REST está disponible en `http://IP_BRIGHTSIGN:3000/api`.
- El socket UDP escucha en `UDP_PORT`.
- Hay una instancia `Kmtronic` por device registrado.
- El backend empieza a hacer polling secuencial.

---

## 5. Secuencia de carga inicial del frontend

```mermaid
sequenceDiagram
    autonumber
    participant User as Usuario
    participant Browser as Navegador
    participant Web as Express Web :8080
    participant API as Express API :3000
    participant Manager as DeviceManager

    User->>Browser: Abrir http://IP_BRIGHTSIGN:8080
    Browser->>Web: GET /
    Web-->>Browser: INDEX_HTML
    Browser->>API: GET /api/devices
    API->>Manager: list()
    Manager-->>API: devices con último estado conocido
    API-->>Browser: JSON devices
    Browser->>Browser: Renderiza select de devices
    Browser->>Browser: Selecciona primer device disponible
    Browser->>API: GET /api/device/:id/status
    API-->>Browser: Estado del device seleccionado
    Browser->>Browser: Renderiza 8 botones toggle
```

---

## 6. Secuencia de polling automático del frontend

El frontend no consulta todos los dispositivos. Solo consulta el estado en memoria del device seleccionado.

```mermaid
sequenceDiagram
    autonumber
    participant Browser as Frontend
    participant API as Express API
    participant Manager as DeviceManager
    participant Device as Kmtronic seleccionado

    loop Cada 10 segundos
        Browser->>API: GET /api/device/:id/status
        API->>Manager: get(id)
        Manager-->>API: device
        API->>Device: getStatus()
        Device-->>API: estado actual en memoria
        API-->>Browser: JSON con relays[1..8]
        Browser->>Browser: Actualiza feedback visual de botones
    end
```

### Nota de diseño

Este endpoint no lanza tráfico UDP. Devuelve el último estado conocido por el backend, evitando saturar la placa con polling duplicado desde cada navegador conectado.

---

## 7. Secuencia de polling secuencial del backend

El backend es quien interroga periódicamente a todos los devices registrados.

```mermaid
sequenceDiagram
    autonumber
    participant Timer as setInterval POLL_MS
    participant Manager as DeviceManager
    participant D1 as Kmtronic 1
    participant UDP as UDPServer
    participant Board as KMTronic físico

    Timer->>Manager: pollOnce(delayBetweenMs)
    Manager->>D1: queryStatus()
    D1->>D1: Encola comando
    D1->>UDP: send("FF0000")
    UDP->>Board: UDP FF0000
    Board-->>UDP: UDP "01010000"
    UDP-->>Manager: message { ip, data }
    Manager->>D1: onMessage(data)
    D1->>D1: parseRelayPayload("01010000")
    D1->>D1: Actualiza relays y lastUpdated
    D1-->>Manager: Estado actualizado
```

Si se registran más devices, `DeviceManager.pollOnce()` los recorre uno por uno y aplica `POLL_DELAY_MS` entre dispositivos.

---

## 8. Secuencia de activación/desactivación de un relé

Cuando el operador pulsa un botón, la API lanza el comando UDP y espera la respuesta confirmada del KMTronic. Esa respuesta debe contener el estado completo de los 8 relés.

```mermaid
sequenceDiagram
    autonumber
    participant User as Usuario
    participant Browser as Frontend
    participant API as Express API
    participant Manager as DeviceManager
    participant Device as Kmtronic
    participant UDP as UDPServer
    participant Board as KMTronic físico

    User->>Browser: Click toggle relé N
    Browser->>API: POST /api/device/:id/relay/:relay { state }
    API->>Manager: get(id)
    API->>Device: setRelay(relay, state)
    Device->>Device: Encola comando para evitar solapes
    Device->>UDP: send("FF0N0X")
    UDP->>Board: UDP comando relé
    Board-->>UDP: UDP feedback "10100000"
    UDP-->>Manager: message { ip, data }
    Manager->>Device: onMessage(data)
    Device->>Device: Parseo 8 bits y actualización de estado
    Device-->>API: getStatus() actualizado
    API-->>Browser: JSON ok + estado completo
    Browser->>Browser: Actualiza los 8 botones según feedback real
```

---

## 9. Máquina de estados simplificada de un device

```mermaid
stateDiagram-v2
    [*] --> Disconnected
    Disconnected --> Querying: queryStatus() o setRelay()
    Querying --> Connected: respuesta UDP válida /^[01]{8}$/
    Querying --> Disconnected: timeout 3000 ms
    Connected --> Querying: nuevo comando UDP
    Connected --> Connected: feedback UDP válido
    Connected --> Disconnected: timeout en comando posterior
```

---

## 10. Modelo de datos de estado REST

Ejemplo de respuesta esperada para un device:

```json
{
  "id": "kmtronic-1",
  "ip": "192.168.0.115",
  "port": 12345,
  "status": "connected",
  "raw": "10100000",
  "lastUpdated": "2026-05-19T19:30:00.000Z",
  "relays": [
    { "relay": 1, "state": "on" },
    { "relay": 2, "state": "off" },
    { "relay": 3, "state": "on" },
    { "relay": 4, "state": "off" },
    { "relay": 5, "state": "off" },
    { "relay": 6, "state": "off" },
    { "relay": 7, "state": "off" },
    { "relay": 8, "state": "off" }
  ]
}
```

### Regla de parseo

```mermaid
flowchart LR
    Raw[Payload UDP "10100000"] --> Split[Separar en 8 caracteres]
    Split --> R1[Relé 1 = 1 = ON]
    Split --> R2[Relé 2 = 0 = OFF]
    Split --> R3[Relé 3 = 1 = ON]
    Split --> R4[Relé 4 = 0 = OFF]
    Split --> R5[Relé 5 = 0 = OFF]
    Split --> R6[Relé 6 = 0 = OFF]
    Split --> R7[Relé 7 = 0 = OFF]
    Split --> R8[Relé 8 = 0 = OFF]
```

---

## 11. Diagrama de despliegue

```mermaid
flowchart TB
    DevPC[PC desarrollo]
    Build[pnpm run deploy:pack]
    Dist[dist/deploy]
    BrightSign[BrightSign\nNode.js 14]
    Browser[Cliente navegador]
    Kmtronic[Placa KMTronic]

    DevPC --> Build
    Build --> Dist
    Dist -->|copiar archivos| BrightSign

    BrightSign -->|HTTP WEB_PORT 8080| Browser
    Browser -->|HTTP API_PORT 3000| BrightSign
    BrightSign -->|UDP DEVICE_PORT 12345| Kmtronic
    Kmtronic -->|UDP feedback 8 bits| BrightSign
```

### Puertos implicados

| Puerto | Protocolo | Uso |
|---:|---|---|
| `8080` | HTTP | Panel web servido al navegador. |
| `3000` | HTTP | API REST consumida por el panel. |
| `12345` | UDP | Comunicación con la placa KMTronic. |

---

## 12. Consideraciones recomendadas

### Producción en BrightSign

- Fijar IP estática del BrightSign.
- Fijar IP estática del KMTronic.
- Verificar conectividad UDP entre ambos equipos.
- Evitar que varios procesos Node controlen la misma placa simultáneamente.
- Mantener un único proceso responsable de polling y comandos.

### Escalabilidad a varios KMTronic

La arquitectura ya soporta varios devices añadiendo nuevas entradas al array `registeredDevices`. El `DeviceManager` mantiene:

- Mapa por `id`, para acceso desde REST.
- Mapa por `ip`, para enrutar respuestas UDP al dispositivo correcto.
- Polling secuencial, para evitar colisiones de tráfico y respuestas mezcladas.

### Mejora futura recomendada

Actualmente el registro de devices está en `main.js` usando variables de entorno. Para instalaciones grandes puede ser mejor moverlo a un fichero externo `devices.json`, por ejemplo:

```json
[
  {
    "id": "rack-av-1",
    "ip": "192.168.0.115",
    "port": 12345
  }
]
```

Esto permitiría modificar la instalación sin recompilar el bundle.
