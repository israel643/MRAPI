-- ============================================================================
-- 001 · INVENTARIO CON CÓDIGOS QR  (DOWN)
--
-- Devuelve el esquema al estado original (mr-manager-bd.sql, BD "MR").
-- ATENCIÓN: se pierden los datos guardados SOLO en las estructuras nuevas
-- (plantillas, características, unidades, QR, ubicaciones, lotes de etiquetas y
-- las columnas nuevas). Los datos originales no se tocan.
-- Haga una copia antes:  mysqldump --routines --triggers MR > MR_before_down.sql
-- Escrito para tolerar una ejecución parcial del UP.
-- ============================================================================

DROP PROCEDURE IF EXISTS mig_drop_fk;
DROP PROCEDURE IF EXISTS mig_drop_constraint;
DROP PROCEDURE IF EXISTS mig_drop_column;
DROP PROCEDURE IF EXISTS mig_drop_index;
DROP PROCEDURE IF EXISTS mig_add_index;
DELIMITER //
CREATE PROCEDURE mig_add_index(IN p_table VARCHAR(64), IN p_name VARCHAR(64), IN p_columns VARCHAR(255))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_name) THEN
    SET @mig_sql = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_name, '` (', p_columns, ')');
    PREPARE s FROM @mig_sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END //
CREATE PROCEDURE mig_drop_fk(IN p_table VARCHAR(64), IN p_column VARCHAR(64))
BEGIN
  DECLARE v_name VARCHAR(64) DEFAULT NULL;
  SELECT CONSTRAINT_NAME INTO v_name FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
    AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1;
  IF v_name IS NOT NULL THEN
    SET @mig_sql = CONCAT('ALTER TABLE `', p_table, '` DROP FOREIGN KEY `', v_name, '`');
    PREPARE s FROM @mig_sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END //
CREATE PROCEDURE mig_drop_constraint(IN p_table VARCHAR(64), IN p_name VARCHAR(64))
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND CONSTRAINT_NAME = p_name
               AND CONSTRAINT_TYPE = 'CHECK') THEN
    SET @mig_sql = CONCAT('ALTER TABLE `', p_table, '` DROP CONSTRAINT `', p_name, '`');
    PREPARE s FROM @mig_sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END //
CREATE PROCEDURE mig_drop_index(IN p_table VARCHAR(64), IN p_name VARCHAR(64))
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_name) THEN
    SET @mig_sql = CONCAT('ALTER TABLE `', p_table, '` DROP INDEX `', p_name, '`');
    PREPARE s FROM @mig_sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END //
CREATE PROCEDURE mig_drop_column(IN p_table VARCHAR(64), IN p_column VARCHAR(64))
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column) THEN
    SET @mig_sql = CONCAT('ALTER TABLE `', p_table, '` DROP COLUMN `', p_column, '`');
    PREPARE s FROM @mig_sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END //
DELIMITER ;

-- 9. Vistas nuevas
DROP VIEW IF EXISTS VW_UNIT_HISTORY;
DROP VIEW IF EXISTS VW_ARTICLE_STOCK;

-- 8. Movimientos
CALL mig_drop_fk('Movement_Item', 'unit_id');
CALL mig_drop_constraint('Movement_Item', 'ck_movement_item_qty');
CALL mig_drop_constraint('Movement_Item', 'ck_movement_item_unit_qty');
CALL mig_drop_constraint('Movement_Item', 'ck_movement_item_amounts');
-- La FK movement_id puede estar usando uq_movement_item_unit como índice: se
-- recrea primero su índice original para poder borrar el UNIQUE.
CALL mig_add_index('Movement_Item', 'movement_id', 'movement_id');
CALL mig_drop_index('Movement_Item', 'uq_movement_item_unit');
CALL mig_drop_index('Movement_Item', 'ix_movement_item_unit');
CALL mig_drop_column('Movement_Item', 'unit_id');

CALL mig_drop_fk('Movement', 'provider_id');
CALL mig_drop_fk('Movement', 'location_id');
CALL mig_drop_fk('Movement', 'movement_type_id');
CALL mig_drop_fk('Movement', 'user_id');
CALL mig_drop_index('Movement', 'ix_movement_type_date');
CALL mig_drop_column('Movement', 'provider_id');
CALL mig_drop_column('Movement', 'location_id');
CALL mig_drop_column('Movement', 'notes');
-- Se restauran las FKs originales (incluido ON DELETE CASCADE).
ALTER TABLE Movement
  ADD FOREIGN KEY (movement_type_id) REFERENCES Movement_Type(id) ON DELETE CASCADE,
  ADD FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE;

-- 7, 6, 5. Etiquetas, QR y unidades
DROP TABLE IF EXISTS Label_Batch_Item;
DROP TABLE IF EXISTS Label_Batch;
DROP TRIGGER IF EXISTS trg_qr_code_immutable;
DROP TRIGGER IF EXISTS trg_qr_code_no_delete;
DROP TABLE IF EXISTS Qr_Code;
DROP TABLE IF EXISTS Inventory_Unit;

-- 4. Artículos
DROP TABLE IF EXISTS Article_Attribute;
CALL mig_drop_fk('Articles', 'category_id');
CALL mig_drop_fk('Articles', 'brand_id');
CALL mig_drop_fk('Articles', 'measurement_id');
CALL mig_drop_fk('Articles', 'template_id');
CALL mig_drop_fk('Articles', 'created_by');
CALL mig_drop_constraint('Articles', 'ck_articles_stock');
CALL mig_drop_constraint('Articles', 'ck_articles_prices');
CALL mig_drop_index('Articles', 'uq_articles_sku');
CALL mig_drop_index('Articles', 'uq_articles_brand_model');
CALL mig_drop_index('Articles', 'ix_articles_category_active');
CALL mig_drop_index('Articles', 'ix_articles_name');
-- Índices creados implícitamente por las FKs nuevas (MySQL los nombra como la FK)
CALL mig_drop_index('Articles', 'fk_articles_template');
CALL mig_drop_index('Articles', 'fk_articles_user');
CALL mig_drop_index('Articles', 'fk_articles_category');
CALL mig_drop_index('Articles', 'fk_articles_brand');
CALL mig_drop_index('Articles', 'fk_articles_measurement');
CALL mig_drop_column('Articles', 'model');
CALL mig_drop_column('Articles', 'sku');
CALL mig_drop_column('Articles', 'tracking_mode');
CALL mig_drop_column('Articles', 'template_id');
CALL mig_drop_column('Articles', 'created_by');
CALL mig_drop_column('Articles', 'created_at');
CALL mig_drop_column('Articles', 'updated_at');
ALTER TABLE Articles
  MODIFY ind_active TINYINT DEFAULT 1,
  ADD FOREIGN KEY (category_id) REFERENCES Category(id) ON DELETE CASCADE,
  ADD FOREIGN KEY (brand_id) REFERENCES Brand(id) ON DELETE CASCADE,
  ADD FOREIGN KEY (measurement_id) REFERENCES Measurement(id) ON DELETE CASCADE;

-- 3, 2. Plantillas y ubicaciones
DROP TABLE IF EXISTS Article_Template_Attribute;
DROP TABLE IF EXISTS Article_Template;
DROP TABLE IF EXISTS Location;

-- 1. Catálogos
CALL mig_drop_index('Movement_Type', 'uq_movement_type_name');
ALTER TABLE Movement_Type MODIFY name VARCHAR(50) NULL;
CALL mig_drop_index('Measurement', 'uq_measurement_name');
CALL mig_drop_index('Brand', 'uq_brand_name');
CALL mig_drop_index('Category', 'uq_category_name');
CALL mig_drop_column('Category', 'created_at');
CALL mig_drop_column('Category', 'updated_at');

DROP PROCEDURE IF EXISTS mig_drop_fk;
DROP PROCEDURE IF EXISTS mig_drop_constraint;
DROP PROCEDURE IF EXISTS mig_drop_column;
DROP PROCEDURE IF EXISTS mig_drop_index;
DROP PROCEDURE IF EXISTS mig_add_index;
