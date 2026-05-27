-- --------------------------------------------------------
-- SQL Schema for Webhooks System
-- Run this script in your FluxDocsERP database
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS webhooks_empresa (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_de_empresa BIGINT NOT NULL,
    url_destino VARCHAR(1024) NOT NULL,
    secreto_firma VARCHAR(64) NOT NULL,
    eventos_suscritos JSON NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id_de_empresa) REFERENCES empresas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS webhook_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    webhook_id INT NOT NULL,
    evento VARCHAR(128) NOT NULL,
    payload JSON NOT NULL,
    http_status INT,
    response_body TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (webhook_id) REFERENCES webhooks_empresa(id) ON DELETE CASCADE
);
