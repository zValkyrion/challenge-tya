const PDFExtract = require('pdf.js-extract').PDFExtract;
const pdfExtract = new PDFExtract();
const options = {};
pdfExtract.extract('Prueba_Data_Engineer_Jr_Mid.pdf', options, (err, data) => {
  if (err) return console.log(err);
  let textLines = [];
  data.pages.forEach((page) => {
    page.content.forEach((item) => {
      textLines.push(item.str);
    });
  });
  console.log(textLines.join('\n'));
});
