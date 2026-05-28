# FormDocs — Editor de PDF e Imagem com Campos de Formulário

## 🎯 Objetivo
Aplicação web estática que permite carregar um **PDF** ou **imagem**, inserir campos de formulário editáveis diretamente sobre o documento e exportar o resultado como PDF preenchido.

---

## ✅ Funcionalidades Implementadas

### Upload
- Arrastar & soltar (drag-and-drop) de arquivos
- Seleção via botão "Escolher Arquivo"
- Suporte a: **PDF**, PNG, JPG, JPEG, WEBP, GIF
- Renderização fiel de PDFs multipáginas via **PDF.js**

### Campos de Formulário
| Tipo       | Descrição                                   |
|------------|---------------------------------------------|
| Texto      | Input de texto simples                      |
| Área       | Textarea multilinha                         |
| Checkbox   | Caixa de seleção com rótulo                 |
| Rádio      | Botão de opção com rótulo                   |
| Select     | Lista suspensa com opções configuráveis     |
| Assinatura | Canvas de assinatura manual (mouse/touch)   |

### Edição dos Campos
- **Arrastar** para reposicionar livremente sobre o documento
- **Redimensionar** via handle no canto inferior direito
- **Painel de propriedades** lateral com:
  - Rótulo, placeholder/texto
  - Tamanho e cor da fonte
  - Posição X/Y e dimensões exatas
  - Opções para Select (uma por linha)
  - Botão para redesenhar assinatura

### Navegação
- Barra de navegação para documentos com múltiplas páginas
- Indicador de página atual / total

### Exportação
- **Pré-visualização** modal antes de exportar
- **Exportar PDF** com todos os campos e valores preenchidos via `jsPDF` + `html2canvas`

---

## 📁 Estrutura de Arquivos

```
index.html          — Página principal / layout
css/
  style.css         — Estilos (tema escuro, responsivo)
js/
  app.js            — Lógica principal (upload, campos, export)
README.md
```

---

## 🔗 URIs / Entradas

| Rota       | Descrição             |
|------------|-----------------------|
| `index.html` | Aplicação principal |

---

## 📦 Bibliotecas (CDN)

| Biblioteca    | Versão    | Uso                        |
|---------------|-----------|----------------------------|
| PDF.js        | 3.11.174  | Renderização de PDFs       |
| html2canvas   | 1.4.1     | Captura do canvas da página|
| jsPDF         | 2.5.1     | Geração do PDF exportado   |
| Font Awesome  | 6.4.0     | Ícones da interface        |
| Google Fonts  | Inter     | Tipografia                 |

---

## 🚀 Próximos Passos Sugeridos

- [ ] Desfazer/Refazer (Ctrl+Z)
- [ ] Duplicar campos
- [ ] Alinhar campos (grade/snap)
- [ ] Salvar/carregar estado como JSON
- [ ] Campos de data com date picker
- [ ] Suporte a touch completo no mobile para arrastar campos
