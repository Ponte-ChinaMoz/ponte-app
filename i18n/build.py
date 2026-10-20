# Gera public/js/translations.js a partir das tabelas i18n/t*.tsv
# (colunas: português, inglês, espanhol, italiano, francês, chinês).
import glob, json, os
here = os.path.dirname(os.path.abspath(__file__))
langs = ['en', 'es', 'it', 'fr', 'zh']
d = {l: {} for l in langs}
for f in sorted(glob.glob(os.path.join(here, 't*.tsv'))):
    for line in open(f, encoding='utf-8').read().splitlines():
        if not line.strip():
            continue
        parts = [p.replace('\\n', '\n') for p in line.split('\t')]
        if len(parts) != 6:
            raise SystemExit(f'Linha inválida em {f}: {line[:80]}')
        for i, l in enumerate(langs):
            d[l][parts[0]] = parts[i + 1]
out = os.path.join(here, '..', 'public', 'js', 'translations.js')
with open(out, 'w', encoding='utf-8') as fh:
    fh.write('// Ficheiro gerado por i18n/build.py — edite as tabelas i18n/t*.tsv e volte a gerar.\n')
    fh.write('export const DICT = ' + json.dumps(d, ensure_ascii=False, indent=0) + ';\n')
print({l: len(v) for l, v in d.items()})
