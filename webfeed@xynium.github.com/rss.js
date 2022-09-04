/*
 * Xynium 2022
 * Parse RSS 2 XML
 */

const Me = imports.misc.extensionUtils.getCurrentExtension();


class RssParser  {
    constructor(xmlBase){
        this.Items =[];
        this.Title ='';
        this.HttpLink= '';
        this.Description= '';
        this.PublishDate= '';
        this.n=0;
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
        this.n++;

        let item =new class{
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
                //log('item'+this.n+'  Title  '+item.Title);
            }
            else if (itemElements[i].name == 'link') {
                item.HttpLink = itemElements[i].text;
                // log('item'+this.n+'  Http  '+item.HttpLink);
            }
            else if (itemElements[i].name == 'description') {
                item.Description = itemElements[i].text;
               // log('item'+this.n+'  Desc  '+item.Description);
            }
            else if (itemElements[i].name == 'pubDate') {
                item.PublishDate = itemElements[i].text;
                // log('item'+this.n+'  Date  '+item.PublishDate);
            }
            else if (itemElements[i].name == 'author') {
                item.Author = itemElements[i].text;
                // log('item'+this.n+'  Author  '+item.Author);
            }
        }
        this.Items.push(item);
    }
}

