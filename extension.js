/*
 * WebFeed
 * MK2 by Xynium
 * 
 * From
 *     Tomas Gazovic <gazovic.tomasgmail.com>,
 *     Janka Gazovicova <jana.gazovicova@gmail.com>
 */

'use strict';

const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Soup = imports.gi.Soup;
const St = imports.gi.St;
const Util = imports.misc.util;
const Clutter = imports.gi.Clutter;
const GObject = imports.gi.GObject;
const ExtensionUtils = imports.misc.extensionUtils;
const Gio = imports.gi.Gio;
const JsxmL = Me.imports.jsxml;
const Rss = Me.imports.rss;
const Atom = Me.imports.atom;

const Gettext = imports.gettext.domain('webfeed');
const _ = Gettext.gettext;

const RSS_FEEDS_LIST_KEY = 'rss-feeds-list';
const UPDATE_INTERVAL_KEY = 'update-interval';
const ITEMS_VISIBLE_KEY = 'items-visible';
const DELETE_AFTER = "delete-after"
const _MS_PER_HOUR = 1000 * 60 * 60 ;

const MAXRESPDELAY=400; //en 0.1seconde soit 40 seconde //TODO make a choice in prefdialog

let webfeedClass;
let settings;
let feedsArray;
let rxAsync;
let secu;
 
const WebFeedClass  = GObject.registerClass(
class WebFeedClass extends PanelMenu.Button {
    
    
    _init() {
        super._init(0);

        this._httpSession = null;
        this._startIndex = 0;
        this.hotIndex=0;
        //feedsArray = [];

        this.topBox = new St.BoxLayout();
        // top panel button
        this.icon = new St.Icon({
            gicon : Gio.icon_new_for_string( Me.dir.get_path()+ '/rss_green.png' ),
            style_class: 'webfeed-icon-size'
        });
        
        // 'application-rss+xml-symbolic',
        this.topBox.add_child(this.icon)
        this.add_child(this.topBox);
        
        //Menu
        this._feedsBox = new St.BoxLayout({
            vertical: true,
            reactive: false
        });

        this.feedsSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this.feedsSection);
        
        //lign time
        this.TimeMenu = new PopupMenu.PopupBaseMenuItem({
            reactive: false
        });

        let customTimeBox = new St.BoxLayout({
            style_class: 'webfeed-time-box ',
            vertical: false,
            clip_to_allocation: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: false,
            x_expand: true,
            pack_start: false
        });
        
        this.lastUpdateTime = new St.Button({label: _("Last update")+': --:--'});
        customTimeBox.add_actor(this.lastUpdateTime);
        this.TimeMenu.add_actor(customTimeBox);
        this.menu.addMenuItem(this.TimeMenu);
        
        
        
        let separator = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(separator);

        // buttons in bottom menu bar
        this._buttonMenu = new PopupMenu.PopupBaseMenuItem({
            reactive: false
        });

        let customButtonBox = new St.BoxLayout({
            style_class: 'webfeed-button-box ',
            vertical: false,
            clip_to_allocation: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            //x_expand: true,
            pack_start: false
        });
        
        let prevBtn = this.createRoundButton('go-previous');
        prevBtn.connect('clicked', () => {
            this.onPreviousBtnClicked();
        });
        customButtonBox.add_actor(prevBtn);
        

        let nextBtn = this.createRoundButton('go-next'); 
        nextBtn.connect('clicked', () => {
            this.onNextBtnClicked();
        });
        customButtonBox.add_actor(nextBtn);
        
         let reloadBtn = this.createRoundButton('view-refresh'); 
        reloadBtn.connect('clicked', () => {
            this.realoadRssFeeds();
        });
        customButtonBox.add_actor(reloadBtn);
     
        let settingsBtn = this.createRoundButton('emblem-system'); 
        settingsBtn.connect('clicked', () => {
            ExtensionUtils.openPrefs(); 
        });
        customButtonBox.add_actor(settingsBtn);
        
        this._buttonMenu.add_actor(customButtonBox);
        this.menu.addMenuItem(this._buttonMenu);
        
        try {
            // try to get default browser
            this._browser = Gio.app_info_get_default_for_uri_scheme("http").get_executable();
        }
        catch (err) {
            log(err + ' (get default browser error)');
            //return;
        }
        // loading data on startup
        this.lastUpdateTime.set_label(_("Last update")+': ' + new Date().toLocaleTimeString());
        this.realoadRssFeeds();
    }
    
    createRoundButton(iconName) {
        let button = new St.Button();
        button.child = new St.Icon({
            icon_name: iconName,
            style_class: 'webfeed-button-action' 
        });
        return button;
    }

    stop() {
        //log('stopping webfeed');
        if (this._httpSession)
            this._httpSession.abort();
        if (this.timeout)
            Mainloop.source_remove(this.timeout);
        if (this.wtforresptmr)
            Mainloop.source_remove(this.wtforresptmr);
        this._httpSession = null;
    }

    // previous button clicked callback
    onPreviousBtnClicked(){
        this._startIndex -= settings.get_int(ITEMS_VISIBLE_KEY);
        if (this._startIndex < 0)
            this._startIndex = 0
        this.refreshMenuLst();
    }
    
    //  On next button clicked callback
    onNextBtnClicked (){
        if (this._startIndex + settings.get_int(ITEMS_VISIBLE_KEY) < settings.get_strv(RSS_FEEDS_LIST_KEY).length)
        {
            this._startIndex += settings.get_int(ITEMS_VISIBLE_KEY);
            this._refreshExtensionUI();
        }
    }

    /*
     *  Returns JSON object that represents HTTP (GET method) parameters
     *  stored in URL
     *  url - HTTP request URL
     */
    getParametersAsJson(url) {
        if (url.indexOf('?') == -1)
            return "{}";

        let urlParams = url.substr(url.indexOf('?') + 1);
        let params = urlParams.split('&');

        let jsonObj = "{";
        for (let i = 0; i < params.length; i++)
        {
            let pair = params[i].split('=');
            jsonObj += '"' + pair[0] + '":' + '"' + pair[1] + '"';
            if (i != params.length -1)
                jsonObj += ',';
        }
        jsonObj += "}";

        return jsonObj;
    }

    //reload of RSS feeds from sources set in settings
    realoadRssFeeds() {
        log("Reload all Feeds");
        if (this.timeout)
            Mainloop.source_remove(this.timeout);
            
        if (settings.get_strv(RSS_FEEDS_LIST_KEY).length!=0) {

            feedsArray=[];
            rxAsync=[];
            
            if (settings.get_strv(RSS_FEEDS_LIST_KEY)) {

                for (let i = 0; i < settings.get_strv(RSS_FEEDS_LIST_KEY).length; i++)           {
                    let url = settings.get_strv(RSS_FEEDS_LIST_KEY)[i];
                    let jsonObj = this.getParametersAsJson(url);

                    if (url.indexOf('?') != -1)
                        url = url.substr(0, url.indexOf('?'));

                    this.httpGetRequestAsync(url, JSON.parse(jsonObj), i);
                    rxAsync[i]=1;
                }
    
            } 
            //timer attente response
             this.wtforresptmr=Mainloop.timeout_add(100, this.wtforresp.bind(this));
               secu=0;
          }
          
          // set timeout if enabled
        if (settings.get_int(UPDATE_INTERVAL_KEY) > 0) {
            log("Next scheduled reload after " + settings.get_int(UPDATE_INTERVAL_KEY)*60 + " seconds");
            this.timeout = Mainloop.timeout_add_seconds(settings.get_int(UPDATE_INTERVAL_KEY)*60,  this.realoadRssFeeds.bind(this));
        }
    }
          //wait for all response from http get
          //timer call it every 100ms
          // when all received kill timer
          // if after secu recuest not good throw an error an continue
    wtforresp(){
            if (this.wtforresptmr)
                Mainloop.source_remove(this.wtforresptmr);
            let allz=false;
            try{
                if (secu++>MAXRESPDELAY) throw('ERROR : Http problem :');  //  has waited too long
                allz = rxAsync.every((value, index, array) =>{
                        return value==0 ;
                });
                if (!allz) {
                     this.wtforresptmr=Mainloop.timeout_add(100, this.wtforresp.bind(this));
                     return;
                 }
            }
            catch(error){
                log(error);
                 for (let i = 0; i < settings.get_strv(RSS_FEEDS_LIST_KEY).length; i++) {
                     if (xAsync[i]==1) log(settings.get_strv(RSS_FEEDS_LIST_KEY)[i]+" has not responded ");
                 }
            }
            log('all response  in '+secu/10+' s');
             this.refreshMenuLst();
             this.lastUpdateTime.set_label(_("Last update")+': ' + new Date().toLocaleTimeString());
    }


    /*
     *  Creates asynchronous HTTP GET request 
     *  url - HTTP request URL without parameters
     *  params - JSON object of HTTP GET request parameters
     *  position - Position in RSS sources list
     */
    httpGetRequestAsync(url, params, position) {
        if (this._httpSession == null) this._httpSession = new Soup.SessionAsync();
        //log("[" + position + "] Soup HTTP GET request. URL: " + url + " parameters: " + JSON.stringify(params));
        Soup.Session.prototype.add_feature.call(this._httpSession, new Soup.ProxyResolverDefault());
        let request = Soup.form_request_new_from_hash('GET', url, params);
        if (request==null) return;
      
        this._httpSession.queue_message(request, (self, message)=> {
            //log("[" + position + "] Soup HTTP GET reponse. Status code: " + message.status_code + " Content Type: " + message.response_headers.get_one("Content-Type"));
            if (message.response_body.data) onDownload(message.response_body.data, position);
            else rxAsync[position]=0;
        },);
    }

    //  Reloads feeds section
     refreshMenuLst() {
        let counter = 0;
        this.feedsSection.removeAll();
        this.EraseHotItem();
                
        for (let i = this._startIndex; i < feedsArray.length; i++) {
            if (feedsArray[i] && feedsArray[i].Items) {
                //if (feedsArray[i]==null) continue; //securité
                let old=((new Date()- this.ISODateParser(feedsArray[i].PublishDate)) / _MS_PER_HOUR); 
                if (old>settings.get_int(DELETE_AFTER)) continue;
                if (this.hotIndex<1) {
                    this.warmItem();
                }
                if ((old<(2*settings.get_int(UPDATE_INTERVAL_KEY)/60))&& (this.hotIndex<2)) {
                    this.hotItem(feedsArray[i].Title);
                }
                let nItems = feedsArray[i].Items.length;
                let subMenu = new PopupMenu.PopupSubMenuMenuItem("("+old.toFixed(1)+"H ago) "+feedsArray[i].Title+ ' (' + nItems + ') :') ; //(Encoder.htmlDecode(title) + ' (' + nitems + ')');
                for (let j = 0; j < nItems; j++) {
                    old=((new Date()- this.ISODateParser(feedsArray[i].Items[j].PublishDate)) / _MS_PER_HOUR); 
                    if (old>settings.get_int(DELETE_AFTER)) continue;
                    if ((old<(2*settings.get_int(UPDATE_INTERVAL_KEY)/60))&& (this.hotIndex<2)) {
                        this.hotItem(feedsArray[i].Items[j].Title);
                    }
                    let menuItem = new PopupMenu.PopupMenuItem( "("+old.toFixed(1)+"H ago) "+feedsArray[i].Items[j].Title);  //(Encoder.htmlDecode(title) + ' (' + nitems + ')');
                    subMenu.menu.addMenuItem(menuItem);
                    //subMenu.menu.addAction( ("("+old.toFixed(1)+"H ago) "+feedsArray[i].Items[j].Title), null, 'view-refresh-symbolic'); 
                    menuItem.connect('activate', ()=>{
                           //log("Opening browser with link " +  feedsArray[i].Items[j].HttpLink);
                           Util.trySpawnCommandLine(this._browser + ' ' + feedsArray[i].Items[j].HttpLink);
                    });
                }
                this.feedsSection.addMenuItem(subMenu);   
            }
            else {

                let subMenu = new PopupMenu.PopupMenuItem(_("No data available"));
                this.feedsSection.addMenuItem(subMenu);
            }
            counter++;
            if (counter == settings.get_int(ITEMS_VISIBLE_KEY))
                break;
        }
    }

    ISODateParser (datestr) {
        return new Date(datestr);
    }
    
    //notif new item
    hotItem(strItm){
        this.hotIndex=2;
        this.icon =  new St.Icon({
            gicon : Gio.icon_new_for_string( Me.dir.get_path()+ '/rss_red.png' ),
            style_class: 'webfeed-icon-size'
        });
        this.topBox.remove_all_children() ;
        this.topBox.add_child(this.icon)
        Main.notify("webfeed NEWS : "+strItm);  //TODO prefbox asknotif ok
    }
    
    //il y a des reponses
    warmItem(){
        this.hotIndex=1;
        this.icon =  new St.Icon({
            gicon : Gio.icon_new_for_string( Me.dir.get_path()+ '/rss_yelow.png' ),
            style_class: 'webfeed-icon-size'
        });
        this.topBox.remove_all_children() ;
        this.topBox.add_child(this.icon)
    }
    
    EraseHotItem(){
        this.hotIndex=0;
        this.icon = new St.Icon({
            gicon : Gio.icon_new_for_string( Me.dir.get_path()+ '/rss_green.png' ),
            style_class: 'webfeed-icon-size'
        });
        this.topBox.remove_all_children() ;
        this.topBox.add_child(this.icon)
     }
    
    
});

  /*
     *  On HTTP request response callback 
     *  responseData - response data
     *  position - Position in feed sources list
     */
    function onDownload(responseData, position) {
		let xmlDoc = new JsxmL.REXML(responseData);
        let feedParser;
              
        if (xmlDoc.rootElement.name.toLowerCase().slice(0, 3) == 'rss'){  // 3 est la length de rss
            //log('RSS ');
            feedParser= new Rss.RssParser(xmlDoc.rootElement);
        }  
        
        if (xmlDoc.rootElement.name.toLowerCase().slice(0, 4) == 'feed'){
            //log('ATOM');
            feedParser= new Atom.AtomParser(xmlDoc.rootElement);
        }
        
        if (feedParser==null) {           // entré ni rss ni atom
            log('Bad XML'); 
            return; 
        }       

        if (feedParser.Items.length > 0)
        {
            let Feed = new class{
                   constructor(){
                    this.Title= feedParser.Title; 
                    this.HttpLink=  feedParser.HttpLink;
                    this.PublishDate=feedParser.PublishDate;
                    this.Items= [];
                } };
           
            for (let i = 0; i < feedParser.Items.length; i++) {
                let item = new class{
                   constructor(){
                     this.Title= feedParser.Items[i].Title;
                     this.HttpLink=  feedParser.Items[i].HttpLink;
                     this.PublishDate=feedParser.Items[i].PublishDate;
                }};
                Feed.Items.push(item);
            }
           feedsArray[position] = Feed;  // TODO voir le this
           rxAsync[position]=0;
        } 
        else{
            log('Bad XML no item'); 
            rxAsync[position]=0;
            return; 
        }    
      
    }


function init() {
    ExtensionUtils.initTranslations('webfeed');
}


function enable() {
    settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.webfeed');  
    webfeedClass = new WebFeedClass();
    Main.panel.addToStatusArea('WebFeedMenu', webfeedClass, 0, 'right');
}


function disable() {
    //Mainloop.source_remove(timeout);
    webfeedClass.stop();
    webfeedClass.destroy();
    webfeedClass=null;
    settings=null;
    timeout=null;
    feedsArray=null;
    rxAsync=null;
      secu=null;
}
