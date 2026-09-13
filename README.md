# Cadastro de Atendimentos — estrutura do projeto

Esta pasta deve ter a mesma estrutura da raiz do repositório no GitHub. Assim, o que é alterado aqui é exatamente o que será publicado em `https://dadosturismo.github.io/atendimentos-turismo/`.

## Arquivos do GitHub Pages

- `index.html`: aparência, textos e estrutura visual do formulário. Mudanças de design devem ser feitas aqui.
- `app.js`: comportamento do formulário, armazenamento offline no dispositivo e sincronização com o Apps Script.
- `sw.js`: cache do PWA. Sempre que `index.html` ou `app.js` mudar, aumente o número da constante `CACHE` para os dispositivos receberem a versão nova.
- `manifest.webmanifest`: nome, cor e configuração de instalação do PWA.
- `icon.svg`: ícone do aplicativo instalado.

## Apps Script

- `Code.gs`: recebe as opções do formulário e os atendimentos, valida os dados e grava na Google Sheet. Depois de alterá-lo, crie uma nova versão da implantação do Apps Script.

O arquivo `index3.html` não é mais usado. O formulário é somente o PWA hospedado no GitHub Pages.

## Publicação

1. Atualize os arquivos da raiz no GitHub e faça o commit.
2. Se `Code.gs` mudou, cole-o no Apps Script e crie uma nova versão da implantação.
3. Abra o PWA online e atualize a página para baixar o novo cache.
