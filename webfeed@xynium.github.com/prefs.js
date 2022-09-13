/*
 * WebFeed extension for GNOME Shell
 * Xynium September 2022
 */
'use strict';
const {  Gio, Gtk ,GObject} = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain('moonphases');
const _ = Gettext.gettext;

const COLUMN_ID = 0;
const MAX_UPDATE_INTERVAL = 1440;

const RSS_FEEDS_LIST_KEY = 'rss-feeds-list';
const UPDATE_INTERVAL_KEY = 'update-interval';
const ITEMS_VISIBLE_KEY = 'items-visible';
const DELETE_AFTER = "delete-after"
const OKFORNOTIF ="okfornotif";
const DURHOTISHOT =  "durationhotitem";
const DLYFORRX ="delayforreceive";


function init() {
    ExtensionUtils.initTranslations('moonphases');
}


function buildPrefsWidget () {
     return new PrefsWebFeed();
}
    
    
    
 
const PrefsWebFeed = GObject.registerClass(
 class PrefsWebFeed extends Gtk.Box {

    _init(params = {}) {
        super._init(params);

            this.settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.webfeed');
            let builder = new Gtk.Builder();
            builder.set_translation_domain('WebFeed');
            builder.add_from_file(Me.path + '/prefs.ui');

            // update interval
            let widjet0= builder.get_object("spbt1");
            widjet0.set_range(0, MAX_UPDATE_INTERVAL);
            this.settings.bind(UPDATE_INTERVAL_KEY, widjet0, 'value', Gio.SettingsBindFlags.DEFAULT);
                
            // items visible per page
            let widjet1 = builder.get_object('spbt2');
            this.settings.bind(ITEMS_VISIBLE_KEY, widjet1, 'value', Gio.SettingsBindFlags.DEFAULT);
                
            // delete after
            let widjet3 = builder.get_object('spbtn3');
            this.settings.bind(DELETE_AFTER, widjet3, 'value', Gio.SettingsBindFlags.DEFAULT);
                
            // delais rx
            let widjet4 = builder.get_object('spbtnRxDly');
            this.settings.bind(DLYFORRX, widjet4, 'value', Gio.SettingsBindFlags.DEFAULT);

            // delete news
            let widjet5 = builder.get_object('spindurhot');
            this.settings.bind(DURHOTISHOT, widjet5, 'value', Gio.SettingsBindFlags.DEFAULT);

            // switch btn notif
            let widjet6 = builder.get_object('swNotif');
            this.settings.bind(OKFORNOTIF, widjet6, 'active', Gio.SettingsBindFlags.DEFAULT);

            //feed sources
            this.feedstore = builder.get_object('liststore1');
            this.loadStoreFromsettings( );

            this.widget2 = builder.get_object('trvFeed');
            let column = builder.get_object('treeviewcolumn1');
            let cell = new Gtk.CellRendererText({ editable: false });
            column.pack_start(cell, true);
            column.add_attribute(cell, "text", COLUMN_ID);
            this.widget2.append_column(column);

            let delButton =  builder.get_object('delButton');
            delButton.connect('clicked', ()=>{this.deleteSelected();});
                
            let editButton = builder.get_object('editButton');
            editButton.connect('clicked', ()=>{this.editSelected();});

            let newButton = builder.get_object('newButton');
            newButton.connect('clicked',()=>{this.createNew();});

            return builder.get_object('prefs-container') ;
        }

            /*  Creates modal dialog new or editing  
             *  title - dialog title
             *  text - text in dialog
             *  onOkButton - callback on OK button clicked     */
        createDialog(title, text, onOkButton) {
            let dialog = new Gtk.Dialog({title: title});
            dialog.set_modal(true);
            dialog.set_resizable(true);

            let _entry = new Gtk.Entry({text: text});
            _entry.margin_bottom = 12;
            _entry.width_chars = 80;
            _entry.activates_default = true;

            _entry.connect("changed", ()=> {
                if (_entry.get_text().length === 0)
                    _okButton.sensitive = false;
                else
                    _okButton.sensitive = true;
            });
            dialog.add_action_widget(_entry,2);
            
            dialog.add_action_widget(  new Gtk.Button({label:'Return',icon_name :'gtk-cancel'}) , 0); 
            let _okButton =new Gtk.Button({label:'OK',icon_name:'gtk-ok'}) ;
            dialog.add_action_widget(_okButton , 1); 
            dialog.set_default_response(1);

            /*let dialog_area = dialog.get_content_area();
            dialog_area.prepend(_entry, 0, 0, 0);*/

            dialog.connect("response", (w, response_id)=> {
                if (response_id) {  // button OK
                    onOkButton(_entry.get_text());
                }
                dialog.hide();
            });
            dialog.show();
        }

        createNew() {
            this.createDialog(_("New Feed source"), '', (egtxt) =>{
                if (egtxt==''){
                    return;
                }
                // update tree view
                let iter = this.feedstore.append();
                this.feedstore.set_value(iter, COLUMN_ID, egtxt);
                
                // update this.settings
                let feeds = this.settings.get_strv(RSS_FEEDS_LIST_KEY);
                if (feeds == null)
                    feeds = new Array();

                feeds.push(egtxt);
                this.settings.set_strv(RSS_FEEDS_LIST_KEY, feeds);
                this.settings.set_boolean("torefresh", true);  
            });
        }

        editSelected() {// update tree view
            let [any, model, iter] = this.widget2.get_selection().get_selected();

            if (any) {
                this.createDialog(_("Edit Feed source"), model.get_value(iter, COLUMN_ID),  (egtxt) =>{
                    if (egtxt==''){
                        return;
                    }
                    this.feedstore.set_value(iter, COLUMN_ID, egtxt);

                    // update this.settings
                    let index = model.get_path(iter).get_indices();
                    let feeds = this.settings.get_strv(RSS_FEEDS_LIST_KEY);
                    if (feeds == null)
                        feeds = new Array();

                    if (index < feeds.length) {
                        feeds[index] = egtxt;
                        this.settings.set_strv(RSS_FEEDS_LIST_KEY, feeds);
                    }
                    this.settings.set_boolean("torefresh", true); 
                });
            }
        }
            
        deleteSelected() {
            let [any, model, iter] = this.widget2.get_selection().get_selected();
            if (any) {
                 let index = model.get_path(iter).get_indices();
                this.feedstore.remove(iter);
                // update this.settings
                let feeds = this.settings.get_strv(RSS_FEEDS_LIST_KEY);
                if (feeds == null)
                    feeds = new Array();

                if (index < feeds.length) {
                    feeds.splice(index, 1);
                    this.settings.set_strv(RSS_FEEDS_LIST_KEY, feeds);
                }
            }
        }

        loadStoreFromsettings() {
            let feeds = this.settings.get_strv(RSS_FEEDS_LIST_KEY);
            if (feeds) {
                for (let i = 0; i < feeds.length; i++) {
                    if (feeds[i]) { // test on empty string
                        let iter = this.feedstore.append();
                        this.feedstore.set_value(iter, COLUMN_ID, feeds[i]);
                    }
                }
            }
        }


});   
   

