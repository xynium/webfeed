/*
 * Xynium 2022
 * Parse RSS 2 XML
 */


var RssParser=class RssParser  {
    constructor(xmlBase){
        this.Items =[];
        this.Title ='';
        this.HttpLink= '';
        this.Description= '';
        this.PublishDate= '';
        this.parse(xmlBase.childElements[0]);
    }

    parse(xml){
        for (let i = 0; i < xml.childElements.length; i++) {
            if (xml.childElements[i].name == 'title') {
                this.Title = xml.childElements[i].text;
            }
            else if (xml.childElements[i].name == 'link') {
                this.HttpLink = xml.childElements[i].text;
            }
            else if (xml.childElements[i].name == 'description') {
               this.Description = xml.childElements[i].text;
            }
            else if (xml.childElements[i].name == 'pubDate') {
                 this.PublishDate = xml.childElements[i].text;
            }
            else if (xml.childElements[i].name == 'item') {
                this.parseItem(xml.childElements[i].childElements);
            }
        }
    }
    
    parseItem(itemElements) {
        var item =new class{
            constructor(){
            var Title= '',
            HttpLink= '',
            Description= '',
            Author= '',
            Contributor= '',
            PublishDate= ''
        }};

        for (let i = 0; i < itemElements.length; i++) {

            if (itemElements[i].name == 'title') {
                item.Title = itemElements[i].text;
            }
            else if (itemElements[i].name == 'link') {
                item.HttpLink = itemElements[i].text;
            }
            else if (itemElements[i].name == 'description') {
                item.Description = itemElements[i].text;
            }
            else if (itemElements[i].name == 'pubDate') {
                item.PublishDate = itemElements[i].text;
            }
            else if (itemElements[i].name == 'author') {
                item.Author = itemElements[i].text;
            }
        }
        this.Items.push(item);
    }
}

