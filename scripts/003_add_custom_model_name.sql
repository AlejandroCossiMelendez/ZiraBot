-- Agregar columna custom_model_name a la tabla bots
USE bot_platform;

ALTER TABLE bots 
ADD COLUMN custom_model_name VARCHAR(100) NULL AFTER model;

CREATE INDEX idx_custom_model_name ON bots(custom_model_name);

