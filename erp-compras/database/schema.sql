-- Esquema PostgreSQL del módulo de Compras (generado desde backend/app/models.py)
CREATE SCHEMA IF NOT EXISTS compras;

CREATE TABLE compras.clasif_bien_serv (
	codigo VARCHAR(1) NOT NULL, 
	descripcion VARCHAR(200) NOT NULL, 
	estado VARCHAR(1) NOT NULL, 
	PRIMARY KEY (codigo)
);

CREATE TABLE compras.empresa (
	emp_cod VARCHAR(64) NOT NULL, 
	emp_ruc VARCHAR(11) NOT NULL, 
	emp_raz_soc VARCHAR(200) NOT NULL, 
	emp_pru VARCHAR(1) NOT NULL, 
	emp_est_reg VARCHAR(1) NOT NULL, 
	PRIMARY KEY (emp_cod), 
	UNIQUE (emp_ruc)
);

CREATE TABLE compras.moneda (
	codigo VARCHAR(3) NOT NULL, 
	descripcion VARCHAR(200) NOT NULL, 
	estado VARCHAR(1) NOT NULL, 
	PRIMARY KEY (codigo)
);

CREATE TABLE compras.tipo_comprobante (
	codigo VARCHAR(2) NOT NULL, 
	descripcion VARCHAR(200) NOT NULL, 
	estado VARCHAR(1) NOT NULL, 
	PRIMARY KEY (codigo)
);

CREATE TABLE compras.tipo_doc_identidad (
	codigo VARCHAR(1) NOT NULL, 
	descripcion VARCHAR(200) NOT NULL, 
	estado VARCHAR(1) NOT NULL, 
	PRIMARY KEY (codigo)
);

CREATE TABLE compras.tipo_existencia (
	codigo VARCHAR(2) NOT NULL, 
	descripcion VARCHAR(200) NOT NULL, 
	estado VARCHAR(1) NOT NULL, 
	PRIMARY KEY (codigo)
);

CREATE TABLE compras.tipo_operacion (
	codigo VARCHAR(2) NOT NULL, 
	descripcion VARCHAR(200) NOT NULL, 
	estado VARCHAR(1) NOT NULL, 
	PRIMARY KEY (codigo)
);

CREATE TABLE compras.unidad_medida (
	codigo VARCHAR(3) NOT NULL, 
	descripcion VARCHAR(200) NOT NULL, 
	estado VARCHAR(1) NOT NULL, 
	PRIMARY KEY (codigo)
);

CREATE TABLE compras.articulo (
	art_cod VARCHAR(64) NOT NULL, 
	emp_cod VARCHAR(64) NOT NULL, 
	art_des VARCHAR(200) NOT NULL, 
	uni_cod VARCHAR(3) NOT NULL, 
	tex_cod VARCHAR(2) NOT NULL, 
	es_servicio BOOLEAN NOT NULL, 
	es_activo_fijo BOOLEAN NOT NULL, 
	art_est_reg VARCHAR(1) NOT NULL, 
	PRIMARY KEY (art_cod), 
	FOREIGN KEY(emp_cod) REFERENCES compras.empresa (emp_cod), 
	FOREIGN KEY(uni_cod) REFERENCES compras.unidad_medida (codigo), 
	FOREIGN KEY(tex_cod) REFERENCES compras.tipo_existencia (codigo)
);

CREATE TABLE compras.bitacora (
	bit_cod VARCHAR(64) NOT NULL, 
	emp_cod VARCHAR(64) NOT NULL, 
	bit_ent VARCHAR(40) NOT NULL, 
	bit_ref VARCHAR(64) NOT NULL, 
	bit_acc VARCHAR(30) NOT NULL, 
	bit_det JSONB, 
	bit_act VARCHAR(128) NOT NULL, 
	bit_ins TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (bit_cod), 
	FOREIGN KEY(emp_cod) REFERENCES compras.empresa (emp_cod)
);

CREATE TABLE compras.evento (
	evt_cod VARCHAR(64) NOT NULL, 
	emp_cod VARCHAR(64) NOT NULL, 
	evt_tip VARCHAR(40) NOT NULL, 
	evt_ref VARCHAR(64) NOT NULL, 
	destino VARCHAR(30) NOT NULL, 
	evt_car JSONB NOT NULL, 
	evt_est VARCHAR(1) NOT NULL, 
	intentos INTEGER NOT NULL, 
	respuesta JSONB, 
	evt_reg_ins TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (evt_cod), 
	CHECK (evt_tip in ('compra.registrada','orden.aprobada','compra.anulada')), 
	CHECK (evt_est in ('P','E','F')), 
	FOREIGN KEY(emp_cod) REFERENCES compras.empresa (emp_cod)
);

CREATE INDEX ix_evt_dest ON compras.evento (emp_cod, destino, evt_est);

CREATE TABLE compras.periodo_cerrado (
	empresa_id VARCHAR(64) NOT NULL, 
	periodo VARCHAR(6) NOT NULL, 
	PRIMARY KEY (empresa_id, periodo), 
	FOREIGN KEY(empresa_id) REFERENCES compras.empresa (emp_cod)
);

CREATE TABLE compras.proveedor (
	prv_cod VARCHAR(64) NOT NULL, 
	emp_cod VARCHAR(64) NOT NULL, 
	prv_doc_tip VARCHAR(1) NOT NULL, 
	prv_doc_num VARCHAR(15) NOT NULL, 
	prv_nom VARCHAR(200) NOT NULL, 
	prv_est_reg VARCHAR(1) NOT NULL, 
	PRIMARY KEY (prv_cod), 
	CONSTRAINT re_prv_id_uni UNIQUE (emp_cod, prv_doc_tip, prv_doc_num), 
	FOREIGN KEY(emp_cod) REFERENCES compras.empresa (emp_cod), 
	FOREIGN KEY(prv_doc_tip) REFERENCES compras.tipo_doc_identidad (codigo)
);

CREATE TABLE compras.solicitud (
	sol_cod VARCHAR(64) NOT NULL, 
	emp_cod VARCHAR(64) NOT NULL, 
	sol_num VARCHAR(15) NOT NULL, 
	sol_fec DATE NOT NULL, 
	sol_usu_cod VARCHAR(128) NOT NULL, 
	sol_are VARCHAR(100) NOT NULL, 
	sol_est VARCHAR(3) NOT NULL, 
	sol_reg_ins TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (sol_cod), 
	UNIQUE (emp_cod, sol_num), 
	CHECK (sol_est in ('PEN','ATE','ANU')), 
	FOREIGN KEY(emp_cod) REFERENCES compras.empresa (emp_cod)
);

CREATE TABLE compras.orden_compra (
	ord_cod VARCHAR(64) NOT NULL, 
	emp_cod VARCHAR(64) NOT NULL, 
	ord_num VARCHAR(15) NOT NULL, 
	sol_cod VARCHAR(64), 
	prv_cod VARCHAR(64) NOT NULL, 
	mon_cod VARCHAR(3) NOT NULL, 
	ord_fec DATE NOT NULL, 
	ord_est VARCHAR(3) NOT NULL, 
	ord_cre VARCHAR(128) NOT NULL, 
	ord_apr_act VARCHAR(128), 
	ord_apr_ins TIMESTAMP WITH TIME ZONE, 
	ord_reg_ins TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (ord_cod), 
	UNIQUE (emp_cod, ord_num), 
	CHECK (ord_est in ('BOR','PEN','APR','ENV','REC','FAC','ANU')), 
	FOREIGN KEY(emp_cod) REFERENCES compras.empresa (emp_cod), 
	FOREIGN KEY(sol_cod) REFERENCES compras.solicitud (sol_cod), 
	FOREIGN KEY(prv_cod) REFERENCES compras.proveedor (prv_cod), 
	FOREIGN KEY(mon_cod) REFERENCES compras.moneda (codigo)
);

CREATE TABLE compras.solicitud_det (
	sol_cod VARCHAR(64) NOT NULL, 
	sdt_itm INTEGER NOT NULL, 
	art_cod VARCHAR(64) NOT NULL, 
	sdt_can NUMERIC(14, 3) NOT NULL, 
	sdt_obs VARCHAR(200), 
	PRIMARY KEY (sol_cod, sdt_itm), 
	CHECK (sdt_can > 0), 
	FOREIGN KEY(sol_cod) REFERENCES compras.solicitud (sol_cod), 
	FOREIGN KEY(art_cod) REFERENCES compras.articulo (art_cod)
);

CREATE TABLE compras.comprobante (
	cmp_cod VARCHAR(64) NOT NULL, 
	emp_cod VARCHAR(64) NOT NULL, 
	ord_cod VARCHAR(64), 
	prv_cod VARCHAR(64) NOT NULL, 
	cmp_per VARCHAR(6) NOT NULL, 
	tcp_cod VARCHAR(2) NOT NULL, 
	cmp_ser VARCHAR(20) NOT NULL, 
	cmp_num VARCHAR(20) NOT NULL, 
	cmp_fec_emi DATE NOT NULL, 
	cmp_fec_ven DATE, 
	mon_cod VARCHAR(3) NOT NULL, 
	cmp_tip_cam NUMERIC(7, 3), 
	cmp_bas NUMERIC(14, 2) NOT NULL, 
	cmp_igv NUMERIC(14, 2) NOT NULL, 
	cmp_no_gra NUMERIC(14, 2) NOT NULL, 
	cmp_tot NUMERIC(14, 2) NOT NULL, 
	cla_cod VARCHAR(1) NOT NULL, 
	top_cod VARCHAR(2) NOT NULL, 
	cmp_est VARCHAR(1) NOT NULL, 
	cmp_reg_ins TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	cmp_reg_act VARCHAR(128) NOT NULL, 
	estado_pago VARCHAR(12), 
	cxp_ref VARCHAR(64), 
	saldo_pendiente NUMERIC(14, 2), 
	activo_estado VARCHAR(24), 
	activo_refs JSONB, 
	PRIMARY KEY (cmp_cod), 
	CONSTRAINT re_cmp_uni UNIQUE (emp_cod, prv_cod, tcp_cod, cmp_ser, cmp_num), 
	CHECK (cmp_bas >= 0 and cmp_igv >= 0 and cmp_no_gra >= 0 and cmp_tot > 0), 
	CONSTRAINT re_cmp_tot_sum CHECK (cmp_tot = cmp_bas + cmp_igv + cmp_no_gra), 
	CHECK (cmp_est in ('R','A')), 
	FOREIGN KEY(emp_cod) REFERENCES compras.empresa (emp_cod), 
	FOREIGN KEY(ord_cod) REFERENCES compras.orden_compra (ord_cod), 
	FOREIGN KEY(prv_cod) REFERENCES compras.proveedor (prv_cod), 
	FOREIGN KEY(tcp_cod) REFERENCES compras.tipo_comprobante (codigo), 
	FOREIGN KEY(mon_cod) REFERENCES compras.moneda (codigo), 
	FOREIGN KEY(cla_cod) REFERENCES compras.clasif_bien_serv (codigo), 
	FOREIGN KEY(top_cod) REFERENCES compras.tipo_operacion (codigo)
);

CREATE INDEX ix_cmp_periodo ON compras.comprobante (emp_cod, cmp_per);

CREATE TABLE compras.orden_compra_det (
	ord_cod VARCHAR(64) NOT NULL, 
	odt_itm INTEGER NOT NULL, 
	art_cod VARCHAR(64) NOT NULL, 
	uni_cod VARCHAR(3) NOT NULL, 
	odt_can NUMERIC(14, 3) NOT NULL, 
	odt_pre NUMERIC(14, 4) NOT NULL, 
	PRIMARY KEY (ord_cod, odt_itm), 
	CHECK (odt_can > 0), 
	CHECK (odt_pre >= 0), 
	FOREIGN KEY(ord_cod) REFERENCES compras.orden_compra (ord_cod), 
	FOREIGN KEY(art_cod) REFERENCES compras.articulo (art_cod), 
	FOREIGN KEY(uni_cod) REFERENCES compras.unidad_medida (codigo)
);

CREATE TABLE compras.ref_recepcion (
	ord_cod VARCHAR(64) NOT NULL, 
	rec_ext VARCHAR(128) NOT NULL, 
	rec_tip VARCHAR(1) NOT NULL, 
	rec_fec DATE NOT NULL, 
	rec_reg_ins TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (ord_cod, rec_ext), 
	CHECK (rec_tip in ('P','T')), 
	FOREIGN KEY(ord_cod) REFERENCES compras.orden_compra (ord_cod)
);
