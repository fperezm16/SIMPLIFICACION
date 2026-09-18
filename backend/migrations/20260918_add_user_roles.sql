CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role)
);

DELETE FROM user_roles old_role
USING user_roles assigned_role
WHERE old_role.user_id = assigned_role.user_id
  AND old_role.role = 'financiero_pagos'
  AND assigned_role.role = 'operador_pagos';

UPDATE user_roles
SET role = 'operador_pagos'
WHERE role = 'financiero_pagos';

INSERT INTO user_roles (user_id, role)
SELECT id, CASE WHEN role = 'financiero_pagos' THEN 'operador_pagos' ELSE role END
FROM users
WHERE role IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;
