-- ============================================================================
-- 000 · COMPROBACIONES PREVIAS (solo lectura)
-- Ejecutar ANTES de 001. Cada consulta debe devolver 0 filas; si alguna devuelve
-- filas, hay datos que impedirían crear las restricciones UNIQUE/CHECK de 001 y
-- deben corregirse manualmente (la migración no decide qué registro conservar).
-- ============================================================================

-- Nombres duplicados (sin distinguir mayúsculas ni espacios exteriores)
SELECT 'Category' AS tabla, LOWER(TRIM(name)) AS valor, COUNT(*) AS veces FROM Category GROUP BY LOWER(TRIM(name)) HAVING COUNT(*) > 1
UNION ALL
SELECT 'Brand', LOWER(TRIM(name)), COUNT(*) FROM Brand GROUP BY LOWER(TRIM(name)) HAVING COUNT(*) > 1
UNION ALL
SELECT 'Measurement', LOWER(TRIM(name)), COUNT(*) FROM Measurement GROUP BY LOWER(TRIM(name)) HAVING COUNT(*) > 1
UNION ALL
SELECT 'Movement_Type', LOWER(TRIM(name)), COUNT(*) FROM Movement_Type GROUP BY LOWER(TRIM(name)) HAVING COUNT(*) > 1;

-- Valores que violarían los CHECK propuestos
SELECT 'Articles.stock < 0' AS problema, id FROM Articles WHERE stock < 0
UNION ALL
SELECT 'Movement_Item.quantity <= 0', id FROM Movement_Item WHERE quantity <= 0
UNION ALL
SELECT 'Movement_Type.name NULL', id FROM Movement_Type WHERE name IS NULL;

-- Coherencia del stock almacenado frente a los movimientos (informativo).
-- Diferencias aquí NO bloquean la migración, pero conviene conocerlas.
SELECT a.id, a.name, a.stock AS stock_guardado,
       COALESCE(SUM(CASE m.movement_type_id WHEN 1 THEN mi.quantity WHEN 2 THEN -mi.quantity END), 0) AS stock_segun_movimientos
FROM Articles a
LEFT JOIN Movement_Item mi ON mi.article_id = a.id
LEFT JOIN Movement m ON m.id = mi.movement_id
GROUP BY a.id, a.name, a.stock
HAVING stock_guardado <> stock_segun_movimientos;
