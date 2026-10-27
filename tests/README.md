# Testes da Trilha Viva

Os testes rodam o módulo num Chromium com um Foundry simulado (`stub.js`). As faixas de teste em `audio/` são tons gerados com uma frequência diferente para cada seção. Assim o teste confere, pelo som, qual trecho está tocando em cada momento.

## Rodar

Na raiz do repositório:

```bash
pip install playwright && python -m playwright install chromium
python -m http.server 8765 --bind 127.0.0.1      # deixe rodando
python tests/teste_audio.py    # loops, troca no fim da volta, crossfade, fila, pausa
python tests/teste_sync.py     # Mestre e jogador em abas: mesma seção, mesmo tempo
python tests/teste_ui.py       # cliques em todas as janelas
python tests/teste_novo.py     # 1.1: clicar para tocar, botão de repetir, dividir automaticamente
python tests/prints.py prints  # prints das janelas em ./prints
```
