# Plan de Desarrollo — Sistema de Venta de Rifas

## 1. Objetivo

Construir una plataforma web para crear, administrar y vender rifas, permitiendo:

- Crear múltiples rifas.
- Definir diferentes cantidades de números por rifa.
- Definir precio por número.
- Definir cantidad mínima y máxima de números por cliente.
- Generar y asignar números aleatoriamente.
- Garantizar que un número nunca pueda venderse dos veces dentro de la misma rifa.
- Reservar números durante el proceso de pago.
- Registrar y validar pagos.
- Enviar al cliente sus números por correo.
- Configurar premios principales y secundarios.
- Utilizar resultados de loterías externas como fuente para determinar ganadores.
- Registrar evidencia del resultado oficial.
- Calcular automáticamente los ganadores.
- Registrar la entrega de premios.
- Mantener una auditoría completa de las operaciones administrativas.

---

# 2. Stack técnico

Utilizar:

- Frontend: Next.js + TypeScript
- UI: Tailwind CSS + shadcn/ui
- Backend: API/server actions de Next.js o una capa backend claramente separada
- Base de datos: PostgreSQL mediante Supabase
- Autenticación: Supabase Auth
- Storage: Supabase Storage
- Email: proveedor desacoplado mediante servicio
- Pagos: integración mediante proveedor configurable
- Deployment: Vercel

### Requisitos generales

Configurar:

- TypeScript
- ESLint
- Prettier
- Variables de entorno
- Migraciones SQL
- Seed inicial
- Manejo centralizado de errores
- Logging
- Validación server-side

No colocar credenciales sensibles en el frontend.

---

# 3. Arquitectura general

```text
                         ┌──────────────┐
                         │   profiles   │
                         └───────┬──────┘
                                 │
                                 ▼
                            ┌─────────┐
                            │ orders  │
                            └────┬────┘
                                 │
                                 ▼
                          ┌────────────┐
                          │order_items │
                          └─────┬──────┘
                                │
                                ▼
                         raffle_numbers
                                ▲
                                │
                           ┌────┴────┐
                           │  raffle │
                           └────┬────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
       raffle_prizes      reservations     raffle_results
              │                                   │
              ▼                                   ▼
       prize_winners                        lottery_draws
              │                                   │
              ▼                                   ▼
      prize_deliveries                         lotteries
```

---

# 4. Modelo de datos

Las tablas principales serán:

```text
profiles

lotteries
lottery_draws

raffles
raffle_numbers
raffle_rules

reservations
reservation_numbers

orders
order_items
payments

raffle_prizes
prize_winners
prize_deliveries

raffle_results
raffle_result_calculations

notifications

audit_logs
```

---

# 5. Usuarios

## Tabla `profiles`

Campos:

```text
id
full_name
email
phone
document_type
document_number
status
created_at
updated_at
```

`id` debe relacionarse con `auth.users.id` de Supabase.

Estados:

```text
active
inactive
blocked
```

Roles iniciales:

```text
customer
admin
```

Preparar la arquitectura para futuros roles:

```text
super_admin
operator
finance
```

---

# 6. Loterías

## Tabla `lotteries`

Catálogo de loterías externas.

Campos:

```text
id
name
description
website_url
country
active
created_at
updated_at
```

Ejemplos:

```text
Lotería de Medellín
Lotería de Boyacá
Lotería de Bogotá
```

Una rifa no debe almacenar solamente el nombre de la lotería. Debe relacionarse con un sorteo específico.

---

# 7. Sorteos de loterías

## Tabla `lottery_draws`

Campos:

```text
id
lottery_id
draw_number
draw_date
winning_number
winning_series
official_source_url
evidence_url
status
published_at
created_at
updated_at
```

Estados:

```text
scheduled
pending_result
result_registered
verified
cancelled
```

Ejemplo:

```text
lottery_id: 1
draw_number: 4857
draw_date: 2026-08-28
winning_number: 58321
winning_series: 147
```

---

# 8. Rifas

## Tabla `raffles`

Campos:

```text
id
name
slug
description
image_url

price_per_number

number_min
number_max
number_format
number_length
total_numbers

minimum_numbers_per_order
maximum_numbers_per_order

number_generation_type

start_at
end_at

lottery_draw_id

status

created_by
created_at
updated_at
```

Ejemplo:

```text
name:
iPhone 17 Pro Max

price_per_number:
10000

number_min:
0

number_max:
9999

number_format:
"0000"

total_numbers:
10000

minimum_numbers_per_order:
2

maximum_numbers_per_order:
20

number_generation_type:
random
```

Estados:

```text
draft
scheduled
active
paused
sales_closed
waiting_result
completed
cancelled
```

Flujo:

```text
draft
  ↓
scheduled
  ↓
active
  ↓
sales_closed
  ↓
waiting_result
  ↓
completed
```

---

# 9. Números de la rifa

## Tabla `raffle_numbers`

Campos:

```text
id
raffle_id
number
status
order_id
reserved_until
sold_at
created_at
updated_at
```

Estados:

```text
available
reserved
sold
blocked
```

Ejemplo:

```text
raffle_id | number | status
----------|--------|----------
25        | 0001   | sold
25        | 0002   | available
25        | 0003   | reserved
25        | 0004   | sold
```

## Restricción crítica

Crear obligatoriamente:

```sql
UNIQUE (raffle_id, number)
```

Esto garantiza:

```text
Rifa 1 → 1234
Rifa 1 → 1234  ❌

Rifa 2 → 1234  ✅
```

El mismo número puede existir en diferentes rifas, pero nunca dos veces dentro de la misma rifa.

---

# 10. Generación de números

Cuando una rifa sea creada y publicada, generar todos sus números.

Ejemplo:

```text
0000 - 9999
```

Generar:

```text
0000
0001
0002
...
9999
```

Cada número comienza con:

```text
status = available
```

Para una rifa de 100 números:

```text
number_min = 0
number_max = 99
number_format = "00"
```

Mostrar:

```text
00
01
02
...
99
```

Para una rifa de 10.000 números:

```text
number_min = 0
number_max = 9999
number_format = "0000"
```

Mostrar:

```text
0000
0001
...
9999
```

El valor almacenado debe ser numérico; el formato se utiliza para presentación.

---

# 11. Reglas de negocio de la numeración

Los números se asignan aleatoriamente durante la compra.

No permitir que el frontend decida directamente qué número queda vendido.

El backend debe realizar la asignación.

La base de datos es la autoridad final para impedir duplicados.

La asignación debe realizarse mediante una transacción PostgreSQL y mecanismos de bloqueo apropiados para soportar compras concurrentes.

---

# 12. Reservas

## Tabla `reservations`

Campos:

```text
id
user_id
raffle_id
status
expires_at
created_at
released_at
```

Estados:

```text
active
expired
released
converted
cancelled
```

## Tabla `reservation_numbers`

Campos:

```text
id
reservation_id
raffle_number_id
created_at
```

Flujo:

```text
available
    ↓
reserved
    ↓
┌───────────────┐
│               │
▼               ▼
paid          expired
│               │
▼               ▼
sold          available
```

La duración debe ser configurable, por ejemplo:

```text
10 minutos
```

Crear un proceso automático para liberar reservas vencidas.

---

# 13. Órdenes

## Tabla `orders`

Campos:

```text
id
order_number

user_id
raffle_id

quantity

subtotal
discount
total

status
payment_status

expires_at

created_at
updated_at
```

Estados:

```text
pending
confirmed
cancelled
expired
refunded
```

Ejemplo:

```text
order_number: RIF-000152
quantity: 5
subtotal: 50000
discount: 0
total: 50000
status: pending
payment_status: pending
```

---

# 14. Números comprados

## Tabla `order_items`

Campos:

```text
id
order_id
raffle_number_id
unit_price
created_at
```

Ejemplo:

```text
order_id | number
---------|-------
152      | 0237
152      | 1842
152      | 3910
152      | 7045
152      | 9821
```

Crear:

```sql
UNIQUE(order_id, raffle_number_id)
```

---

# 15. Pagos

## Tabla `payments`

Campos:

```text
id
order_id

provider
provider_transaction_id

amount
currency

status

payment_method

paid_at
failed_at

metadata

created_at
updated_at
```

Estados:

```text
pending
processing
approved
rejected
cancelled
refunded
```

Crear una abstracción:

```text
PaymentProvider
```

para permitir cambiar de proveedor posteriormente.

---

# 16. Flujo de pago

```text
ORDER
  ↓
PAYMENT_PENDING
  ↓
Proveedor de pagos
  ↓
WEBHOOK
  ↓
Verificación
  ↓
PAYMENT_APPROVED
  ↓
ORDER_CONFIRMED
  ↓
NUMBERS_SOLD
```

Nunca confiar únicamente en el frontend para confirmar un pago.

La confirmación definitiva debe venir del webhook o proceso de verificación del proveedor.

Los webhooks deben ser idempotentes para evitar procesar dos veces el mismo pago.

---

# 17. Confirmación de números

Cuando el pago sea aprobado:

```text
raffle_numbers.status = sold
```

También:

```text
order.status = confirmed
payment.status = approved
```

Guardar:

```text
sold_at
paid_at
provider_transaction_id
```

El proceso debe ser transaccional.

---

# 18. Correos

Después de confirmar la compra enviar un correo con:

```text
Nombre del cliente
Nombre de la rifa
Número de orden
Cantidad comprada
Números asignados
Valor pagado
Fecha
```

Ejemplo:

```text
Compra confirmada

Rifa: iPhone 17 Pro Max
Orden: RIF-000152

Tus números:

0237
1842
3910
7045
9821

Valor: $50.000
```

Registrar todos los envíos en:

```text
notifications
```

Un fallo de correo no debe revertir una compra ya pagada.

---

# 19. Notificaciones

## Tabla `notifications`

Campos:

```text
id

user_id
order_id
raffle_id

type
recipient
subject

status

provider
provider_message_id

sent_at
failed_at

created_at
```

Tipos:

```text
order_created
payment_confirmed
numbers_assigned
prize_won
prize_delivered
raffle_result_published
```

---

# 20. Premios

## Tabla `raffle_prizes`

Campos:

```text
id
raffle_id

name
description

prize_type
prize_value

position

rule_type
rule_value

status

created_at
updated_at
```

Tipos:

```text
main
secondary
```

Reglas posibles:

```text
exact_match
last_digits
first_digits
specific_number
derived_number
```

Ejemplo:

```text
Premio principal
rule_type = exact_match

Premio secundario
rule_type = last_digits
rule_value = 3
```

Las reglas de premios deben quedar configuradas y versionadas antes de procesar el resultado.

---

# 21. Resultado oficial de la rifa

## Tabla `raffle_results`

Campos:

```text
id
raffle_id
lottery_draw_id

source_number
normalized_number

calculation_rule
calculation_version

status

calculated_at
verified_at
published_at

created_at
```

Ejemplo:

```text
source_number:
58321

normalized_number:
8321

calculation_rule:
last_4_digits

calculation_version:
1.0
```

Esto permite demostrar cómo se pasó del resultado oficial al resultado utilizado por la rifa.

---

# 22. Cálculo de resultados

## Tabla `raffle_result_calculations`

Campos:

```text
id
raffle_result_id

input_value
rule_type
rule_parameters

output_value

algorithm_version

calculated_at
```

Guardar un snapshot de la configuración utilizada.

Si la configuración cambia posteriormente, el cálculo histórico debe seguir siendo reproducible.

---

# 23. Motor de ganadores

Crear un servicio independiente:

```text
WinnerCalculationService
```

Entrada:

```text
raffle
lottery_result
raffle_rules
```

Salida:

```text
winning numbers
prize winners
```

Ejemplo:

```text
Resultado externo:
58321

Rifa:
00000 - 99999

Regla:
exact_match

Resultado:
58321
```

El cálculo debe ser determinista.

El administrador no debe poder seleccionar manualmente al ganador después de conocer el resultado.

---

# 24. Números no vendidos

Debe existir una regla definida antes de iniciar la venta.

Flujo:

```text
Número ganador
      ↓
¿Fue vendido?
   ┌───┴───┐
  Sí       No
  ↓         ↓
Ganador   Aplicar regla
```

La estrategia debe estar almacenada en la configuración de la rifa.

Ejemplo:

```text
next_sold
```

Si se utiliza una regla de búsqueda de otro número, esta debe ser determinista, pública y reproducible.

No permitir que un administrador seleccione manualmente el número ganador.

---

# 25. Ganadores

## Tabla `prize_winners`

Campos:

```text
id

raffle_prize_id
raffle_number_id
order_id
user_id

winning_value

status

won_at
contacted_at
delivered_at

created_at
updated_at
```

Estados:

```text
pending
contacted
verified
scheduled
delivered
rejected
```

Relación:

```text
Premio
  ↓
Número ganador
  ↓
Orden
  ↓
Cliente
```

---

# 26. Entrega de premios

## Tabla `prize_deliveries`

Campos:

```text
id
prize_winner_id

delivery_method
delivery_date

recipient_name
recipient_document

reference
notes

evidence_url

delivered_by

created_at
```

Ejemplo:

```text
delivery_method:
bank_transfer

reference:
TRX-938472

evidence_url:
comprobante.pdf
```

Registrar quién entregó el premio y cuándo.

---

# 27. Auditoría

## Tabla `audit_logs`

Campos:

```text
id

user_id

entity_type
entity_id

action

old_data
new_data

ip_address
user_agent

created_at
```

Acciones mínimas:

```text
CREATE_RAFFLE
UPDATE_RAFFLE
CREATE_PRIZE
UPDATE_PRIZE
CREATE_ORDER
PAYMENT_APPROVED
PAYMENT_REJECTED
REGISTER_LOTTERY_RESULT
VERIFY_LOTTERY_RESULT
CALCULATE_WINNERS
PUBLISH_WINNERS
CONTACT_WINNER
DELIVER_PRIZE
CANCEL_ORDER
```

Las operaciones críticas deben quedar auditadas.

La auditoría no debe poder modificarse desde el panel administrativo normal.

---

# 28. Reglas configurables

## Tabla `raffle_rules`

Campos:

```text
id
raffle_id

rule_type
rule_key
rule_value

version
active

created_at
updated_at
```

Ejemplos:

```text
raffle_id | rule_key                 | value
----------|--------------------------|-------
25        | winning_digits           | 4
25        | unassigned_winner_rule   | next_sold
25        | reservation_minutes      | 10
25        | max_numbers_per_order    | 20
25        | min_numbers_per_order    | 2
```

No codificar estas reglas directamente en múltiples componentes del sistema.

---

# 29. Índices

Crear como mínimo:

```sql
CREATE UNIQUE INDEX
idx_raffle_number_unique
ON raffle_numbers (raffle_id, number);

CREATE INDEX
idx_raffle_numbers_status
ON raffle_numbers (raffle_id, status);

CREATE INDEX
idx_orders_user
ON orders (user_id);

CREATE INDEX
idx_orders_raffle
ON orders (raffle_id);

CREATE INDEX
idx_order_items_order
ON order_items (order_id);

CREATE INDEX
idx_prize_winners_user
ON prize_winners (user_id);

CREATE INDEX
idx_audit_logs_entity
ON audit_logs (entity_type, entity_id);
```

Agregar índices adicionales solamente cuando exista una necesidad real de consulta/rendimiento.

---

# 30. Seguridad y RLS

Implementar RLS en Supabase.

## Cliente puede:

```text
VER:
✓ Rifas activas
✓ Premios publicados
✓ Información pública de sorteos
✓ Sus propias compras
✓ Sus propios números
✓ Sus propios premios

NO PUEDE:
✗ Modificar rifas
✗ Modificar números
✗ Modificar pagos
✗ Crear resultados
✗ Cambiar ganadores
✗ Modificar auditoría
✗ Ver compras de otros clientes
```

## Administrador

Puede gestionar los módulos autorizados según su rol.

Los procesos críticos deben ejecutarse en backend con privilegios controlados:

- asignación de números
- reservas
- confirmación de pagos
- procesamiento de webhooks
- cálculo de ganadores
- publicación de resultados

Nunca exponer credenciales de servicio en el navegador.

---

# 31. Panel administrativo

Crear dashboard con:

```text
Rifas activas
Ventas del día
Ventas totales
Números vendidos
Números disponibles
Reservas activas
Premios pendientes
Premios entregados
```

## Gestión de rifas

Permitir:

- Crear
- Editar
- Activar
- Pausar
- Cerrar ventas
- Cancelar
- Consultar estadísticas

## Gestión de ventas

Filtros:

```text
Rifa
Cliente
Orden
Estado
Fecha
Pago
```

## Gestión de números

Buscar:

```text
0001
5832
9999
```

Mostrar:

```text
Estado
Cliente
Orden
Fecha
```

## Gestión de premios

Mostrar:

```text
Premio
Número
Ganador
Estado
Fecha de contacto
Fecha de entrega
```

## Gestión de resultados

Permitir:

- Registrar resultado.
- Adjuntar evidencia.
- Verificar.
- Ejecutar cálculo.
- Revisar ganadores.
- Publicar resultados.

---

# 32. Página pública de la rifa

Mostrar:

```text
Imagen
Nombre
Premio
Precio
Fecha del sorteo
Lotería utilizada
Números disponibles
Porcentaje vendido
Cantidad a comprar
```

Ejemplo:

```text
🎁 iPhone 17 Pro Max

Lotería de Medellín
Sorteo #4857

$10.000 por número

Compra mínimo 2 números

[ - ] 5 [ + ]

Total: $50.000

[Comprar]
```

No mostrar información privada de otros compradores.

---

# 33. Página pública de resultados

Después del sorteo mostrar:

```text
Resultado oficial

Lotería de Medellín
Sorteo #4857

Número oficial:
58321

Regla utilizada:
Últimas 4 cifras

Número ganador:
8321
```

Mostrar los premios y sus ganadores una vez publicados.

---

# 34. Flujo completo de compra

```text
Cliente
  ↓
Selecciona cantidad
  ↓
Validar mínimo/máximo
  ↓
Crear ORDER
  ↓
Seleccionar números disponibles aleatoriamente
  ↓
Bloquear números
  ↓
Crear ORDER_ITEMS
  ↓
Crear reserva
  ↓
Crear PAYMENT_PENDING
  ↓
Cliente paga
  ↓
Proveedor procesa pago
  ↓
Webhook
  ↓
Verificar webhook
  ↓
PAYMENT_APPROVED
  ↓
ORDER_CONFIRMED
  ↓
NUMBERS_SOLD
  ↓
Enviar correo
```

---

# 35. Flujo completo del resultado

```text
Lotería externa
      ↓
Resultado oficial
      ↓
Administrador registra
      ↓
Guardar evidencia
      ↓
Verificar resultado
      ↓
Aplicar algoritmo
      ↓
Obtener número(s) ganador(es)
      ↓
Buscar raffle_numbers
      ↓
Buscar propietarios
      ↓
Calcular premios secundarios
      ↓
Crear prize_winners
      ↓
Revisar resultados
      ↓
Publicar resultados
      ↓
Notificar ganadores
      ↓
Gestionar entrega
```

---

# 36. Pruebas obligatorias

## Números

- [ ] Crear rifa de 100 números.
- [ ] Verificar que existan exactamente 100.
- [ ] Crear rifa de 1.000 números.
- [ ] Crear rifa de 10.000 números.
- [ ] Intentar insertar un número duplicado.
- [ ] Confirmar que PostgreSQL lo rechace.
- [ ] Comprar números.
- [ ] Confirmar que los números vendidos cambien correctamente de estado.

## Concurrencia

Simular múltiples compradores simultáneos.

Ejemplo:

```text
100 clientes
comprando simultáneamente
```

Debe cumplirse:

```text
0 números duplicados
0 números vendidos dos veces
```

## Reservas

- [ ] Crear reserva.
- [ ] Verificar expiración.
- [ ] Liberar reserva.
- [ ] Comprar número liberado.
- [ ] Impedir comprar números reservados por otro usuario.

## Pagos

Probar:

```text
approved
rejected
cancelled
duplicate webhook
webhook tardío
refund
```

## Ganadores

Probar:

```text
resultado válido
resultado inválido
número vendido
número no vendido
premio principal
premios secundarios
múltiples ganadores
```

## Seguridad

Probar:

- [ ] Usuario no puede modificar números.
- [ ] Usuario no puede modificar pagos.
- [ ] Usuario no puede cambiar resultados.
- [ ] Usuario no puede ver compras de otros clientes.
- [ ] Usuario no puede modificar auditoría.
- [ ] Admin sin permiso específico no puede ejecutar acciones restringidas.

---

# 37. Criterios de aceptación

El proyecto no se considera terminado hasta cumplir:

- [ ] Se pueden crear múltiples rifas.
- [ ] Cada rifa puede tener diferente cantidad de números.
- [ ] Se puede configurar mínimo y máximo por compra.
- [ ] Los números se generan automáticamente.
- [ ] Los números se asignan aleatoriamente.
- [ ] No existen números duplicados.
- [ ] Las compras concurrentes no generan duplicados.
- [ ] Los números se reservan durante el pago.
- [ ] Las reservas vencidas se liberan.
- [ ] Los pagos se confirman mediante backend/webhook.
- [ ] Los números pasan a `sold` únicamente después del pago aprobado.
- [ ] El cliente recibe sus números por correo.
- [ ] Se pueden configurar loterías externas.
- [ ] Una rifa puede asociarse a un sorteo específico.
- [ ] Se puede registrar el resultado oficial.
- [ ] Se almacena evidencia del resultado.
- [ ] El resultado puede verificarse.
- [ ] Los ganadores se calculan automáticamente.
- [ ] Se pueden configurar premios secundarios.
- [ ] Se puede identificar al comprador de un número ganador.
- [ ] Se puede registrar la entrega del premio.
- [ ] Todas las operaciones críticas quedan auditadas.
- [ ] El cliente no puede modificar información crítica.
- [ ] Un administrador no puede modificar silenciosamente un resultado ya publicado.
- [ ] Los cálculos de ganadores son reproducibles.
- [ ] Las reglas utilizadas para calcular ganadores quedan versionadas.

---

# 38. Orden de implementación

El agente debe seguir este orden:

```text
1. Configuración del proyecto
        ↓
2. Base de datos + migraciones
        ↓
3. Auth + roles + RLS
        ↓
4. Rifas
        ↓
5. Generación de números
        ↓
6. Reservas
        ↓
7. Órdenes
        ↓
8. Pagos
        ↓
9. Confirmación de números
        ↓
10. Emails
        ↓
11. Loterías
        ↓
12. Resultados oficiales
        ↓
13. Motor de ganadores
        ↓
14. Premios secundarios
        ↓
15. Entrega de premios
        ↓
16. Auditoría
        ↓
17. Dashboard administrativo
        ↓
18. Frontend público
        ↓
19. Pruebas
        ↓
20. Seguridad
        ↓
21. Deploy
```

---

# 39. Reglas críticas para el agente

1. No comenzar por las interfaces. Primero implementar modelo de datos y reglas de negocio.
2. No permitir asignación de números directamente desde el frontend.
3. Utilizar transacciones PostgreSQL para operaciones críticas.
4. Utilizar `UNIQUE (raffle_id, number)` como protección definitiva contra duplicados.
5. Los pagos deben confirmarse mediante webhook/proceso de verificación.
6. Los webhooks deben ser idempotentes.
7. Las reservas deben tener expiración automática.
8. Un número solamente pasa a `sold` después de un pago aprobado.
9. El resultado ganador debe depender de una fuente externa definida para la rifa.
10. Las reglas de cálculo deben estar definidas antes del sorteo.
11. El cálculo de ganadores debe ser determinista y reproducible.
12. No permitir seleccionar manualmente ganadores después del resultado.
13. Guardar evidencia del resultado oficial.
14. Versionar las reglas y algoritmos utilizados.
15. Registrar todas las operaciones críticas en auditoría.
16. No permitir modificar silenciosamente resultados o ganadores publicados.
17. Mantener separación entre datos públicos y datos privados.
18. Mantener las credenciales y claves sensibles exclusivamente en backend.
19. Crear pruebas automatizadas para concurrencia, pagos, reservas y cálculo de ganadores.
20. No considerar una funcionalidad terminada hasta cumplir sus criterios de aceptación.

---

# 40. Resultado esperado

Al finalizar debe existir una plataforma donde:

```text
ADMINISTRADOR
    │
    ├── Crea rifa
    ├── Configura números
    ├── Define mínimo/máximo
    ├── Selecciona lotería
    ├── Selecciona sorteo
    ├── Configura premios
    └── Publica rifa
              │
              ▼
          CLIENTES
              │
              ├── Compran
              ├── Pagan
              └── Reciben números
                        │
                        ▼
                  LOTERÍA EXTERNA
                        │
                        ▼
                 Resultado oficial
                        │
                        ▼
                 MOTOR DE CÁLCULO
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
        Premio principal     Premios secundarios
              │                   │
              └─────────┬─────────┘
                        ▼
                    GANADORES
                        │
                        ▼
                ENTREGA DE PREMIOS
```

La prioridad del desarrollo debe ser **integridad, transparencia, concurrencia y trazabilidad**, antes que funcionalidades visuales.


