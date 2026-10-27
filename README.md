# Trilha Viva 1.1.0 — painel de música para o Foundry VTT

Módulo para Foundry V13/V14. Usa as playlists que já existem no mundo e acrescenta:

- várias camadas tocando ao mesmo tempo (música + ambiente + efeitos);
- fila temporária com as faixas marcadas, repetição e aleatório;
- músicas divididas em seções (loop de fase de chefe) com troca "no fim da volta" ou "agora";
- tudo sincronizado: todos os jogadores ouvem o mesmo trecho no mesmo momento.

## Instalar

No Foundry (ou na Forge), em **Instalar Módulo**, cole este link no campo *URL do Manifesto*:

```
https://github.com/Yamavaki/Trilha-Viva/releases/latest/download/module.json
```

Depois, ative **Trilha Viva** em *Gerenciar Módulos*. Atualizações aparecem sozinhas pelo mesmo link.

Para instalar à mão, baixe `trilha-viva.zip` na página de [Releases](https://github.com/Yamavaki/Trilha-Viva/releases) e extraia em `Data/modules/trilha-viva/`.

## Abrir

- Botão **Trilha Viva** na aba de Playlists (só o Mestre vê), ou
- atalho **Shift + M** (dá para trocar em *Configurar Controles*).

## Painel principal

- **▶** numa faixa: toca. Clicar de novo para.
- Músicas trocam entre si com crossfade. Ambientes e efeitos tocam por cima.
- **Caixinhas + "Tocar marcadas como fila"**: monta uma fila temporária e abre a janela da fila.
- **Etiqueta da faixa** ("Música", "Seções"): abre o editor de seções.
- **Botão direito numa faixa**: editar seções, mudar o tipo (Música / Ambiente / Efeito), ligar "Repetir a faixa" ou remover da playlist.
- O tipo decide qual volume do jogador vale: Música usa o volume de Playlists, Ambiente o de Ambiente e Efeito o de Interface.

## Seções (efeito de chefe)

1. Abra o editor pela etiqueta da faixa.
2. Escolha um jeito de criar as seções:
   - **Modelo: música de chefe** cria Introdução, Fase 1, Transição, Fase final e Encerramento, com os cortes já sugeridos pela análise.
   - **Sugerir cortes** propõe cortes para qualquer música.
   - Ou dê play e clique em **+ Marcar corte aqui**.
3. Arraste as bordas coloridas para ajustar. Com **Grudar no tempo** ligado, os cortes grudam na batida para a emenda não pular.
4. Clique no quadradinho colorido de uma seção para ouvir só ela em loop. Só você ouve essa prévia.
5. Marque **em loop** nas seções que repetem e clique em **Salvar seções**.

Na luta, abra o **controle ao vivo** pelo card da música em "Tocando agora":

- **No fim da volta**: termina a repetição atual e entra na seção escolhida no tempo certo.
- **Agora (crossfade)**: troca na hora. O controle de Crossfade define a duração.
- **Ao chegar no fim da seção**: repetir esta seção, seguir a música ou repetir a música inteira.

### Atalhos rápidos (1.1)

- **Clique em qualquer ponto** da linha de seções, da barra de progresso ou da onda do editor: a música passa a tocar dali.
- **Botão de repetir (⟳) em cada seção**: na seção que está tocando, liga ou desliga o loop na hora, sem cortar. Numa outra seção, ela entra no fim da volta atual e fica repetindo. Clique de novo para desistir.
- **Tocar direto**: ignora os loops salvos e segue a música até o fim.
- **Dividir automaticamente**: uma música sem seções pode ser dividida em partes com um clique no controle ao vivo.
- Salvar seções com a música tocando passa a valer na hora.

### Macros

```js
TrilhaViva.secao("Fase final");           // no fim da volta
TrilhaViva.secao("Fase final", "agora");  // na hora, com crossfade
TrilhaViva.pararTudo();
TrilhaViva.abrir();
```

## Bom saber

- Seções funcionam em arquivos de até 10 minutos. Arquivos maiores tocam normalmente, mas só repetem inteiros.
- O navegador de cada jogador só libera o som depois do primeiro clique na tela. Isso é igual às playlists do próprio Foundry.
- Se o Mestre recarregar a página, a música continua para os jogadores.
