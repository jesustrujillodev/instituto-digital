-- La base de cada forma de despliegue y la de la integración con Vitest, para
-- que ninguna vea las filas de otra. `idc_queued` la crea POSTGRES_DB.
CREATE DATABASE idc_inline;
CREATE DATABASE idc_integration;
