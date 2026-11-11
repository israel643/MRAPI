-- ============================================================================
-- 001 · INVENTARIO CON CÓDIGOS QR  (UP)  — PROPUESTA, PENDIENTE DE VALIDACIÓN
--
-- Base: esquema original mr-manager-bd.sql (BD "MR"; no se versiona aquí porque
--       contiene el hash de la contraseña del administrador y el repo es público).
-- Compatible con MySQL 8.0.16+ y MariaDB 10.5+ (CHECK, columnas generadas).
--
-- Antes de ejecutar:
--   1. Copia de seguridad:  mysqldump --routines --triggers MR > MR_backup.sql
--   2. Ejecutar 000_preflight_checks.sql y resolver lo que devuelva.
-- Reversión: 001_qr_inventory.down.sql
--
-- Principios:
--   * No se borra ni se reescribe ningún dato existente.
--   * Solo se AÑADEN columnas/tablas/restricciones, salvo el cambio de
--     ON DELETE CASCADE -> RESTRICT en claves foráneas (ver diagnóstico §2.3):
--     es el único cambio de comportamiento sobre lo existente y es justamente
--     lo que impide perder historial al borrar un catálogo o un usuario.
--   * Las sentencias DDL de MySQL no son transaccionales: si algo falla a mitad,
--     ejecutar el DOWN (está escrito para tolerar una ejecución parcial) y
--     restaurar la copia si fuera necesario.
-- ============================================================================

SET NAMES utf8mb4;

-- ----------------------------------------------------------------------------
-- Utilidad: borra una FK por (tabla, columna) sin depender del nombre generado
-- (Articles_ibfk_1, etc. pueden variar entre servidores).
-- ----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS mig_drop_fk;
DELIMITER //
CREATE PROCEDURE mig_drop_fk(IN p_table VARCHAR(64), IN p_column VARCHAR(64))
BEGIN
  DECLARE v_name VARCHAR(64) DEFAULT NULL;
  SELECT CONSTRAINT_NAME INTO v_name
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
    AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1;
  IF v_name IS NOT NULL THEN
    SET @mig_sql = CONCAT('ALTER TABLE `', p_table, '` DROP FOREIGN KEY `', v_name, '`');
    PREPARE s FROM @mig_sql; EXECUTE s; DEALLOCATE PREPARE s;
  END IF;
END //
DELIMITER ;

-- ============================================================================
-- 1. CATÁLOGOS EXISTENTES: unicidad y auditoría
-- ============================================================================
ALTER TABLE Category
  ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD CONSTRAINT uq_category_name UNIQUE (name);

ALTER TABLE Brand
  ADD CONSTRAINT uq_brand_name UNIQUE (name);

ALTER TABLE Measurement
  ADD CONSTRAINT uq_measurement_name UNIQUE (name);

ALTER TABLE Movement_Type
  MODIFY name VARCHAR(50) NOT NULL,
  ADD CONSTRAINT uq_movement_type_name UNIQUE (name);

-- ============================================================================
-- 2. UBICACIONES (almacén / zona / estante)
-- ============================================================================
CREATE TABLE Location (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(30)  NOT NULL,
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  ind_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_location_code UNIQUE (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- 3. PLANTILLAS DE ARTÍCULO (entidad propia, NO es un artículo ni una unidad)
--    Se crean desde cero o "a partir de un artículo" (copia de valores).
--    Editar una plantilla no toca los artículos ya creados con ella.
-- ============================================================================
CREATE TABLE Article_Template (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(100)  NOT NULL,             -- nombre de la plantilla
  category_id       INT           NOT NULL,
  article_name      VARCHAR(200)  NOT NULL,             -- valor por defecto de Articles.name
  description       TEXT          NULL,
  brand_id          INT           NULL,
  model             VARCHAR(100)  NULL,
  measurement_id    INT           NULL,
  tracking_mode     ENUM('BULK','SERIALIZED') NOT NULL DEFAULT 'BULK',
  purchase_price    DECIMAL(10,2) NULL,
  sale_price        DECIMAL(10,2) NULL,
  source_article_id INT           NULL,                 -- artículo del que se tomó (trazabilidad)
  ind_active        TINYINT(1)    NOT NULL DEFAULT 1,
  created_by        INT           NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_template_category_name UNIQUE (category_id, name),
  CONSTRAINT fk_template_category    FOREIGN KEY (category_id)       REFERENCES Category(id)    ON DELETE RESTRICT,
  CONSTRAINT fk_template_brand       FOREIGN KEY (brand_id)          REFERENCES Brand(id)       ON DELETE RESTRICT,
  CONSTRAINT fk_template_measurement FOREIGN KEY (measurement_id)    REFERENCES Measurement(id) ON DELETE RESTRICT,
  CONSTRAINT fk_template_source      FOREIGN KEY (source_article_id) REFERENCES Articles(id)    ON DELETE SET NULL,
  CONSTRAINT fk_template_user        FOREIGN KEY (created_by)        REFERENCES Users(id)       ON DELETE SET NULL,
  CONSTRAINT ck_template_prices CHECK ((purchase_price IS NULL OR purchase_price >= 0) AND (sale_price IS NULL OR sale_price >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Article_Template_Attribute (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  template_id   INT          NOT NULL,
  name          VARCHAR(60)  NOT NULL,
  default_value VARCHAR(255) NULL,
  is_required   TINYINT(1)   NOT NULL DEFAULT 0,
  sort_order    SMALLINT     NOT NULL DEFAULT 0,
  CONSTRAINT uq_template_attr UNIQUE (template_id, name),
  CONSTRAINT fk_template_attr_template FOREIGN KEY (template_id) REFERENCES Article_Template(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- 4. ARTÍCULOS (= modelo / referencia de catálogo, NO una unidad física)
-- ============================================================================
CALL mig_drop_fk('Articles', 'category_id');
CALL mig_drop_fk('Articles', 'brand_id');
CALL mig_drop_fk('Articles', 'measurement_id');

ALTER TABLE Articles
  MODIFY ind_active TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN model         VARCHAR(100) NULL AFTER brand_id,
  ADD COLUMN sku           VARCHAR(40)  NULL AFTER model,
  ADD COLUMN tracking_mode ENUM('BULK','SERIALIZED') NOT NULL DEFAULT 'BULK' AFTER stock,
  ADD COLUMN template_id   INT NULL,
  ADD COLUMN created_by    INT NULL,
  ADD COLUMN created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD CONSTRAINT uq_articles_sku         UNIQUE (sku),
  -- Un mismo modelo de una marca no puede darse de alta dos veces (NULL = sin modelo, no se compara)
  ADD CONSTRAINT uq_articles_brand_model UNIQUE (brand_id, model),
  ADD INDEX ix_articles_category_active (category_id, ind_active),
  ADD INDEX ix_articles_name (name),
  ADD CONSTRAINT fk_articles_category    FOREIGN KEY (category_id)    REFERENCES Category(id)         ON DELETE RESTRICT,
  ADD CONSTRAINT fk_articles_brand       FOREIGN KEY (brand_id)       REFERENCES Brand(id)            ON DELETE RESTRICT,
  ADD CONSTRAINT fk_articles_measurement FOREIGN KEY (measurement_id) REFERENCES Measurement(id)      ON DELETE RESTRICT,
  ADD CONSTRAINT fk_articles_template    FOREIGN KEY (template_id)    REFERENCES Article_Template(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_articles_user        FOREIGN KEY (created_by)     REFERENCES Users(id)            ON DELETE SET NULL,
  ADD CONSTRAINT ck_articles_stock  CHECK (stock >= 0),
  ADD CONSTRAINT ck_articles_prices CHECK (purchase_price >= 0 AND sale_price >= 0);

-- Características libres del artículo (clave/valor). Copiadas desde la plantilla
-- en el alta; después son independientes.
CREATE TABLE Article_Attribute (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  article_id INT          NOT NULL,
  name       VARCHAR(60)  NOT NULL,
  value      VARCHAR(255) NOT NULL,
  sort_order SMALLINT     NOT NULL DEFAULT 0,
  CONSTRAINT uq_article_attr UNIQUE (article_id, name),
  CONSTRAINT fk_article_attr_article FOREIGN KEY (article_id) REFERENCES Articles(id) ON DELETE CASCADE,
  INDEX ix_article_attr_name_value (name, value(50))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- 5. UNIDADES FÍSICAS DE INVENTARIO (solo artículos SERIALIZED)
-- ============================================================================
CREATE TABLE Inventory_Unit (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  article_id    INT          NOT NULL,
  serial_number VARCHAR(100) NULL,                    -- nº de serie del fabricante (opcional)
  location_id   INT          NULL,
  status        ENUM('AVAILABLE','ISSUED','RETIRED') NOT NULL DEFAULT 'AVAILABLE',
  notes         VARCHAR(255) NULL,
  ind_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_by    INT          NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_unit_article_serial UNIQUE (article_id, serial_number),
  CONSTRAINT fk_unit_article  FOREIGN KEY (article_id)  REFERENCES Articles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_unit_location FOREIGN KEY (location_id) REFERENCES Location(id) ON DELETE RESTRICT,
  CONSTRAINT fk_unit_user     FOREIGN KEY (created_by)  REFERENCES Users(id)    ON DELETE SET NULL,
  INDEX ix_unit_article_status (article_id, status),
  INDEX ix_unit_location (location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- 6. CÓDIGOS QR
--    El QR solo contiene `code` (aleatorio, opaco, estable). Todo lo demás se
--    consulta en el backend. Un código apunta a UN artículo o a UNA unidad.
--    Reimpresión por etiqueta dañada: se revoca el código y se emite otro;
--    el revocado queda guardado para que nunca pueda reasignarse.
-- ============================================================================
CREATE TABLE Qr_Code (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  article_id    INT NULL,
  unit_id       INT NULL,
  status        ENUM('ACTIVE','REVOKED') NOT NULL DEFAULT 'ACTIVE',
  created_by    INT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at    DATETIME NULL,
  revoked_by    INT NULL,
  revoke_reason VARCHAR(255) NULL,
  -- Columnas auxiliares: como mucho UN código ACTIVO por artículo y por unidad.
  active_article_id INT AS (CASE WHEN status = 'ACTIVE' THEN article_id END) STORED,
  active_unit_id    INT AS (CASE WHEN status = 'ACTIVE' THEN unit_id END) STORED,
  CONSTRAINT uq_qr_code UNIQUE (code),
  CONSTRAINT uq_qr_active_article UNIQUE (active_article_id),
  CONSTRAINT uq_qr_active_unit UNIQUE (active_unit_id),
  CONSTRAINT ck_qr_one_target CHECK ((article_id IS NULL) <> (unit_id IS NULL)),
  CONSTRAINT ck_qr_revoked CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL)),
  CONSTRAINT fk_qr_article FOREIGN KEY (article_id) REFERENCES Articles(id)       ON DELETE RESTRICT,
  CONSTRAINT fk_qr_unit    FOREIGN KEY (unit_id)    REFERENCES Inventory_Unit(id) ON DELETE RESTRICT,
  CONSTRAINT fk_qr_created FOREIGN KEY (created_by) REFERENCES Users(id)          ON DELETE SET NULL,
  CONSTRAINT fk_qr_revoked FOREIGN KEY (revoked_by) REFERENCES Users(id)          ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Regla de negocio "nunca reutilizar un QR": el código y su destino son inmutables,
-- un código revocado no se reactiva y los códigos no se borran.
DELIMITER //
CREATE TRIGGER trg_qr_code_immutable BEFORE UPDATE ON Qr_Code
FOR EACH ROW
BEGIN
  IF NEW.code <> OLD.code
     OR NOT (NEW.article_id <=> OLD.article_id)
     OR NOT (NEW.unit_id <=> OLD.unit_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Un código QR no puede reasignarse ni modificarse';
  END IF;
  IF OLD.status = 'REVOKED' AND NEW.status = 'ACTIVE' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Un código QR revocado no puede reactivarse';
  END IF;
END //
CREATE TRIGGER trg_qr_code_no_delete BEFORE DELETE ON Qr_Code
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Los códigos QR no se eliminan; revóquelos';
END //
DELIMITER ;

-- ============================================================================
-- 7. LOTES DE IMPRESIÓN DE ETIQUETAS
--    Registra qué códigos se imprimieron, en qué hoja y posición.
-- ============================================================================
CREATE TABLE Label_Batch (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  layout     VARCHAR(30) NOT NULL,             -- p. ej. 'LETTER_3x10'
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_label_batch_user FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Label_Batch_Item (
  batch_id   INT      NOT NULL,
  qr_code_id BIGINT   NOT NULL,
  page       SMALLINT NOT NULL,
  position   SMALLINT NOT NULL,
  PRIMARY KEY (batch_id, qr_code_id),
  CONSTRAINT uq_label_slot UNIQUE (batch_id, page, position),
  CONSTRAINT fk_label_item_batch FOREIGN KEY (batch_id)   REFERENCES Label_Batch(id) ON DELETE CASCADE,
  CONSTRAINT fk_label_item_qr    FOREIGN KEY (qr_code_id) REFERENCES Qr_Code(id)     ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- 8. MOVIMIENTOS: no perder historial y enlazar unidades
-- ============================================================================
CALL mig_drop_fk('Movement', 'movement_type_id');
CALL mig_drop_fk('Movement', 'user_id');

ALTER TABLE Movement
  ADD COLUMN provider_id INT NULL AFTER user_id,
  ADD COLUMN location_id INT NULL AFTER provider_id,
  ADD COLUMN notes VARCHAR(255) NULL AFTER total,
  ADD CONSTRAINT fk_movement_type     FOREIGN KEY (movement_type_id) REFERENCES Movement_Type(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_movement_user     FOREIGN KEY (user_id)          REFERENCES Users(id)         ON DELETE RESTRICT,
  ADD CONSTRAINT fk_movement_provider FOREIGN KEY (provider_id)      REFERENCES Providers(id)     ON DELETE RESTRICT,
  ADD CONSTRAINT fk_movement_location FOREIGN KEY (location_id)      REFERENCES Location(id)      ON DELETE RESTRICT,
  ADD INDEX ix_movement_type_date (movement_type_id, created_at);

ALTER TABLE Movement_Item
  ADD COLUMN unit_id INT NULL AFTER article_id,
  ADD CONSTRAINT fk_movement_item_unit FOREIGN KEY (unit_id) REFERENCES Inventory_Unit(id) ON DELETE RESTRICT,
  ADD CONSTRAINT uq_movement_item_unit UNIQUE (movement_id, unit_id),
  ADD INDEX ix_movement_item_unit (unit_id),
  ADD CONSTRAINT ck_movement_item_qty CHECK (quantity > 0),
  ADD CONSTRAINT ck_movement_item_unit_qty CHECK (unit_id IS NULL OR quantity = 1),
  ADD CONSTRAINT ck_movement_item_amounts CHECK (price >= 0 AND subtotal >= 0);

-- ============================================================================
-- 9. VISTAS NUEVAS
-- ============================================================================
-- Existencia por artículo: BULK = Articles.stock; SERIALIZED = unidades disponibles.
CREATE OR REPLACE VIEW VW_ARTICLE_STOCK AS
SELECT a.id AS article_id, a.name, a.sku, a.tracking_mode, a.category_id,
       CASE WHEN a.tracking_mode = 'SERIALIZED'
            THEN (SELECT COUNT(*) FROM Inventory_Unit u
                  WHERE u.article_id = a.id AND u.status = 'AVAILABLE' AND u.ind_active = 1)
            ELSE a.stock END AS available
FROM Articles a;

-- Historial de cada unidad física.
CREATE OR REPLACE VIEW VW_UNIT_HISTORY AS
SELECT mi.unit_id, m.id AS movement_id, mt.name AS movement_type, m.created_at,
       m.user_id, m.location_id, m.notes, mi.price
FROM Movement_Item mi
JOIN Movement m       ON m.id = mi.movement_id
JOIN Movement_Type mt ON mt.id = m.movement_type_id
WHERE mi.unit_id IS NOT NULL;

DROP PROCEDURE IF EXISTS mig_drop_fk;
