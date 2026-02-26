## Migraciones SQL

Este directorio contiene migraciones para cambios incrementales de base de datos.

### Flujo recomendado

1. Crear migracion:
   - `npm run migrate:new -- agregar_campo_x`
2. Editar el archivo SQL generado en esta carpeta.
3. Ejecutar migraciones pendientes:
   - `npm run migrate`
4. Subir el archivo SQL al repositorio junto con el codigo.

### Reglas

- No edites una migracion ya ejecutada en otros entornos.
- Si necesitas corregir algo, crea una nueva migracion.
- Usa SQL idempotente cuando aplique (`IF EXISTS`, `IF NOT EXISTS`).
