-- Catálogo inicial de produtos (preços por litro e doses padrão).
-- Valores conferidos na plataforma anterior; revisar em Configurações.
-- FT Pasto usa o preço da Política Comercial 2026 (R$ 50/L), não o do planejamento (R$ 40/L).
-- Produtos sem preço ficam como "preço pendente" e não entram em propostas até o preço ser cadastrado.
insert into public.products (name, culture, price_per_l, default_dose_l_ha, package_l) values
  ('FT Poly Campo', 'Soja / multiculturas', 60, 2, 5),
  ('FT Corn', 'Milho', 60, 2, 5),
  ('FT Cotton', 'Algodão', 90, 4, 5),
  ('FT Pasto', 'Pastagem', 50, 1, 5),
  ('FT Bean', 'Feijão', 80, 2, 5),
  ('SC Booster', 'Multiculturas', 65, 2, 5),
  ('FT Wheat', 'Trigo', 40, 2, 5),
  ('FT Advanced', 'Multiculturas', 120, 2, 5),
  ('FT Hort', 'Hortaliças', null, 2, 5),
  ('FT Fruit', 'Frutíferas', null, 2, 5),
  ('FT Grass', 'Gramados', null, 2, 5),
  ('FT Garden Plus', 'Jardinagem', null, 2, 5)
on conflict (name) do nothing;
