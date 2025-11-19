USE bot_platform;

-- Insertar empresa de ejemplo
INSERT INTO companies (name, email, status) VALUES 
('Empresa Demo', 'demo@example.com', 'active');

-- Obtener el ID de la empresa insertada
SET @company_id = LAST_INSERT_ID();

-- Insertar token de ejemplo
INSERT INTO api_tokens (company_id, token, name, status) VALUES 
(@company_id, SHA2(CONCAT('demo-token-', NOW()), 256), 'Token Principal', 'active');

-- Insertar bot de ejemplo
INSERT INTO bots (company_id, name, description, model, system_prompt, temperature, max_tokens, status) VALUES 
(@company_id, 'Asistente de Código', 'Bot especializado en ayudar con programación', 'deepseek-coder-v2:latest', 'Eres un asistente experto en programación. Ayuda a los usuarios con sus dudas de código de manera clara y concisa.', 0.7, 2000, 'active'),
(@company_id, 'Asistente General', 'Bot de propósito general para conversaciones', 'llama3.2:1b', 'Eres un asistente útil y amigable. Responde de manera clara y profesional.', 0.8, 1500, 'active');
