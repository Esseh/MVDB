/*:
* @plugindesc Allows Database-Esque (NoSQL) Interactions for RPG Maker MV internals.
* @author Kenneth "Esseh" Willeford
*
* BE SURE TO READ THIS DOCUMENTATION
* @help Databases can be made with a lifespan of one of two levels..
*  1. Temporary Level : (will persist so long as the game remains open)
*  2. Save File Level : (persists within a save file)
* Additionally there is a basic interface for global values that persist even after the game is closed.
*
* All interfactions are performed through script calls (or within plugins) through the 'MVDB' variable. This variable has the following public methods...
*  newDB(string databaseName,string intendedLifespan)
*   This creates a new database of lifespan "Temp" or "Save" (case sensitive, other values will fail silently.)
*  deleteDB(string databaseName,string intendedLifespan)
*   This deletes a created database.
*  getDB(string databaseName,string intendedLifespace)
*   This retrieves one of the created databases which can be stored in a variable. From there database methods may be accessed.
*   EXCEPTIONS-
*    NoSuchItem : Thrown if the database doesn't exist.
*
* In addition the 'MVDB' variable has 1 public attribute 'global' with the following public methods...
*  add(string key,string item)
*   This add an item to localStorage to be retreived. As localStorage is limited 
*   these methods should be used sparingly and only with small amounts of data.
*   EXCEPTIONS-
*    GlobalSizeLimitReached : Thrown if there is no room in localStorage for the intended object.
*  remove(string key)
*   Removes an item from localStorage.
*  get(string key)
*   Retreives an item from localStorage.
*   EXCEPTIONS-
*    NoSuchItem : Thrown if the item doesn't exist.
*
* A Database Object or 'DB' object has the following public methods...
*  getItem(keyType key)
*   This allows the retrieval of an object bypassing the need for tables and entry keys given
*   that you have the respective entry's global key.
*   EXCEPTIONS-
*    NoSuchItem : Thrown if the key doesn't lead to an item.
*  makeTable(string modelName,object Model,string[] ancestors)
*   Creates a table with a respective modelName with a model created from hints provided by the object with 0 or more ancestors...
*   What is a Model?-
*    A model is a data structure representing what is 'expected' out of a database entry.
*    For example if the Model was {uID:1,email:"example@example.com"}
*    then future database entries will be expected an integer whenever it sees uID and a string whenever it sees email.
*    Violating this will result in an error. However missing entries will simply be replaced with null, and extra elements will simply be ignored.
*   What is an Ancestor?
*    An ancestor is simply an existing model to be used as a basis for building the current model.
*    To continue the previous example we can have that be a Model named "User".
*    Next we will introduce a Model named "Admin" with the following model. {editAnything:true,deleteAnything:true,makeAnything:true}.
*    By providing ["User"] the our ancestors Admin has implicitly gained the uID and email properties.
*    Of course Admin is now tied to User, so if User were to ever be deleted Admin would disappear as well.
*   EXCEPTIONS-
*    ModelExists : Thrown if the modelName is already in use.
* getTable(string modelName)
*  Retrieves a table from which table's public methods may be accessed.
*  Be sure to store it in a variable.
*  As an aside: Note that the terms Table and Model can be used interchangebly.
*  EXCEPTIONS-
*   NoSuchItem : Thrown if the table doesn't exist.
*
* A Table Object has the following public methods...
*  add(string key,object value)
*   adds an entry to the table making sure that the object matches the model/ancestors.
*   missing values are subbed with null
*   extra values are ignored.
*   EXCEPTIONS-
*    ReservedCharacterUsed : Triggered if '%' is in the key.
*    ModelMistmatch : Thrown if there was a mismatch between types between the model and new object.
*  remove(string key)
*   removes an entry of the table.
*   EXCEPTIONS-
*    ReservedCharacterUsed : Triggered if '%' is in the key.
*    NoSuchItem : Thrown if there is no item to remove.
*  get(string key)
*   retrieves an entry of the table
*   EXCEPTIONS-
*    NoSuchItem : Thrown if there is no item to get.
*  getKey(string key)
*   like get but instead retrieves the entry's global key.
*   EXCEPTIONS-
*    NoSuchItem : Thrown if there is no item to get.
*  delete()
*   erases the table and all descendant tables.
*  select(callback filter(obj))
*   retrieves an array of every object that fulfills the filter condition.
*   for example .select(function(obj){return obj.condition == true; });
*   would provide every object in which the condition field is true.
*   If uncaught exceptions occur within the callback then that object is simply ignored.
*  selectKeys(callback filter(obj))
*   like select but returns an array of global keys instead.
*  makeView(string viewName,callback filterCallback(obj))
*   Creates a view with access to view methods.
*   A view is essentially a stored select statement. When the database changes it is automatically updated.
*   This means many views can be created to look at specific types of data or data that fulfills certain conditions.
*   Using a view will be much faster than using the same select statement many times.
*  getView(string viewName)
*   retrieves a view in a variable giving access to it's methods.
*   EXCEPTIONS-
*    NoSuchItem : Thrown if the view doesn't exist.
*
* Views have the following public methods...
*  select(callback filter(obj))
*   identical to table's but only looking at items in the view.
*  selectKeys(callback filter(obj))
*   identical to table's but only looking at items in the view.
*  getAll()
*   retrieves every item that the view is looking at.
*  makeView(string viewName, callback filter(obj))
*   creates a new view based on a condition AND what the current view is looking at.
*   Does not throw exceptions, so it can overwrite itself. Be careful of that.
*
* And that's it. Good luck utilizing MVDB in either your games or in your plugins.
*
*/

MVDB = {};
(function(){
	//=============================================================================
	// General Module Components
	//=============================================================================
	var module = {
		exceptions : {
			GlobalSizeLimitReached:function(){throw "GlobalSizeLimitReached";},
			NoSuchItem:function(){throw "NoSuchItem";},
			ModelExists:function(){throw "ModelExists";},
			ModelInvalid:function(){throw "ModelInvalid";},
			ModelMissing:function(){throw "ModelMissing";},
			ModelMismatch:function(){throw "ModelMismatch"},
			ReservedCharacterUsed:function(){throw "ReservedCharacterUsed"}
		},
		/// Performs any neccessary initialization for the module.
		init:function(){
			var oldstart = Scene_Map.prototype.start;
			var oldtitlestart = Scene_Title.prototype.start;
			var loadInitialized = false;
			Scene_Title.prototype.start = function(){
				loadInitialized = false;
				return oldtitlestart.apply(this,arguments);
			};
			Scene_Map.prototype.start = function(){
				if($gameSystem._SaveFileMVDB === undefined) $gameSystem._SaveFileMVDB = {};
				// Cases of loaded data means loss of prototype, so prototype for save DB's must be restored. 
				if(!loadInitialized){
					/// Set each database object to DB
					for(var i in $gameSystem._SaveFileMVDB){
						Object.setPrototypeOf($gameSystem._SaveFileMVDB[i],DB.prototype);
						/// Set each table object in each database to Table.
						for(var t in $gameSystem._SaveFileMVDB[i].tables){
							Object.setPrototypeOf($gameSystem._SaveFileMVDB[i].tables[t],Table.prototype);
							/// Set each view object in each table to View
							for(var v in $gameSystem._SaveFileMVDB[i].tables[t].views){
								Object.setPrototypeOf($gameSystem._SaveFileMVDB[i].tables[t].views[v],View.prototype);
							}
						}
					}
					loadInitialized = true;
				}
				return oldstart.apply(this,arguments);
			};
			MVDB = new MVDBobj();			
		}
	};
	//=============================================================================
	/// MVDB Interface
	//=============================================================================
	function MVDBobj() {
		this.initialize.apply(this, arguments);
	}
	MVDBobj.prototype.initialize = function(){
		//=============================================================================
		/// GlobalAPI Interface
		// Communicated with localStorage for very basic transactions.
		// Caches received values and utilizes write-through to optimize for speed.
		//=============================================================================
		function GlobalAPI(){ 
			this.initialize.apply(this, arguments); 
		}
		GlobalAPI.prototype.initialize = function(){ 
			this.globalCache = {}; 
		};
		// Throws GlobalSizeLimitReached if localStorage cannot hold anymore.
		GlobalAPI.prototype.add = function(key,value){
			try{
				this.globalCache[key] = value;
				localStorage.setItem(key,value);
			} catch(e) {
				module.exceptions.GlobalSizeLimitReached();
			}
		};
		GlobalAPI.prototype.remove = function(key){
			delete this.globalCache[key];
			localStorage.removeItem(key);
		};
		// Throws NoSuchItem if the entry doesn't exist.
		GlobalAPI.prototype.get = function(key){
			var val = this.globalCache[key];
			if(val === undefined) val = localStorage.getItem(key)
			if(val === null ) module.exceptions.NoSuchItem();
			return val;
		};
		this.global = new GlobalAPI();
		this.temporaryDatabases = {};
	};
	MVDBobj.prototype.newDB = function(DBName,DBLifeSpan){
		if(DBLifeSpan=="Temp") this.temporaryDatabases[DBName] = new DB(DBName);
		if(DBLifeSpan=="Save") $gameSystem._SaveFileMVDB[DBName] = new DB(DBName);			
	};
	MVDBobj.prototype.deleteDB = function(DBName,DBLifeSpan){
		if(DBLifeSpan=="Temp") delete this.temporaryDatabases[DBName];
		if(DBLifeSpan=="Save") delete $gameSystem._SaveFileMVDB[DBName];		
	};
	// Throws NoSuchItem if the database doesn't exist.
	MVDBobj.prototype.getDB = function(DBName,DBLifeSpan){
		var val = {}
		if(DBLifeSpan=="Temp") val = this.temporaryDatabases[DBName];
		if(DBLifeSpan=="Save") val = $gameSystem._SaveFileMVDB[DBName];		
		if(val === undefined) module.exceptions.NoSuchItem();
		return val;
	};
	//=============================================================================
	/// DB Interface
	// Allows the production and management of tables utilizing models.
	//=============================================================================
	function DB(){
		this.initialize.apply(this, arguments);
	}
	DB.prototype.initialize = function(DBName){
		this.name = DBName;
		this.tables = {};
	};
	// Retrieves a database entry using a global key. Throws NoSuchItem if the item doesn't exist.
	DB.prototype.getItem = function(key){
		if(this.tables[key.tableKey] === undefined) module.exceptions.NoSuchItem();
		return this.tables[key.tableKey].get(key.entryKey);
	};
	// Throws ModelExists if the model name is already in use.
	DB.prototype.makeTable = function(modelName,model,ancestors){
		if(this.tables[modelName] !== undefined) module.exceptions.ModelExists();
		this.tables[modelName] = new Table(this.tables,modelName,model,ancestors);
	};
	// Throws NoSuchItem if the table doesn't exist.
	DB.prototype.getTable = function(modelName){
		var output = this.tables[modelName];
		if(output === undefined) module.exceptions.NoSuchItem();
		return output;
	};
	//=============================================================================
	/// Table Object
	// The main element of the database, this contains the model and allows the
	// production of views as well as ancestor relationships.
	//=============================================================================
	function Table() {
		this.initialize.apply(this, arguments);
	}	
	// The constructor for table will throw ModelMissing if a provided ancestor does not exist or InvalidModel if anything but a standard object is used.
	Table.prototype.initialize = function(tablesContainer,modelName,model,ancestors){
		/// Make sure that a basic javascript object is being used for the model.
		if(model === undefined || model.constructor === Array || typeof(model) !== "object") module.exceptions.InvalidModel();
		this.views = {};
		this.baseTable = tablesContainer;
		this.name = modelName;	
		this.entries = {};		
		this.model = model;		
		this.ancestors = [];	
		this.descendants = [];	
		// Ensure that ancestors exist.
		for(var i in ancestors){
			expectedAncestor = tablesContainer[ancestors[i]];
			if(expectedAncestor === undefined){
				module.exceptions.ModelMissing()
			} else {
				this.ancestors.push(tablesContainer[ancestors[i]]);
			}
		}
		// Let ancestors know that a descendant object was created.
		for(var j in ancestors){
			tablesContainer[ancestors[j]].descendants.push(this);
		}
	};
	// Will throw ReservedCharacterUsed if '%' is in key.
	// Will throw ModelMismatch if the object used doesn't match up with the model.
	Table.prototype.add = function(key,value,_path){
		if(key.includes("%")) module.exceptions.ReservedCharacterUsed();
		if(_path === undefined) _path = "";
		// Compares Model to Object Portion, null if nothing to compare, error if mismatch.
		function CreateMember(NewObjectMember,ModelMember){
			if(NewObjectMember===undefined || NewObjectMember === null) return null; 
			if(NewObjectMember.constructor !== ModelMember.constructor) module.exceptions.ModelMismatch();
			return NewObjectMember;
		};
		var newObj = {};
		for(var i in this.model){
			newObj[i] = CreateMember(value[i],this.model[i]);
		}
		for(var j in this.ancestors){
			this.ancestors[j].add(key,value,_path+("%"+this.name+"%"));
		}
		this.entries[_path+key] = newObj;
		for(var v in this.views){
			this.views[v]._rebuild();
		}
	};
	// If the entry doesn't exist NoSuchItem will be thrown.
	Table.prototype.remove = function(key,_path){
		if(key.includes("%")) module.exceptions.ReservedCharacterUsed();
		if(_path === undefined) _path = "";
		if(this.entries[_path+key] === undefined) module.exceptions.NoSuchItem();
		for(var i in this.ancestors){
			this.ancestors[i].remove(key,_path+("%"+this.name+"%"));
		}
		delete this.entries[_path+key];
		for(var v in this.views){
			this.views[v]._rebuild();
		}
	};
	// Helper function for get
	Table.prototype._getAncestorObjects = function(key,_path){
		objects = [this.entries[_path+key]];
		for(var i in this.ancestors){
			objects = objects.concat(this.ancestors[i]._getAncestorObjects(key,_path+("%"+this.name+"%")));
		}
		return objects;
	};
	// If the item doesn't exist NoSuchItem will be thrown.
	Table.prototype.get = function(key,_path){
		if(_path === undefined) _path = "";
		if(this.entries[_path+key] === undefined) module.exceptions.NoSuchItem();
		var shards = this._getAncestorObjects(key,_path);
		var output = {};
		for(var i in shards){
			for(var j in shards[i]){
				output[j] = shards[i][j];
			}
		}
		return Object.create(output);
	};
	// If item doesn't exist NoSuchItem will be thrown.
	Table.prototype.getKey = function(key,_path){
		if(_path === undefined) _path = "";
		if(this.entries[_path+key] === undefined) module.exceptions.NoSuchItem();
		return {tableKey:this.name,entryKey:_path+key};
	};
	Table.prototype.delete = function(){
		for(var i in this.descendants){
			this.descendants[i].delete();
		}
		this.views = {};
		for(var key in this.entries){
			this.remove(key);
		}
		delete this.baseTable[this.name];
	};
	Table.prototype.select = function(filterCallback){
		var output = [];
		for(var key in this.entries){
			var val = this.get(key);
			try{
				if(filterCallback(val)) output.push(val);
			} catch(e) {}
		}
		return output;
	};
	Table.prototype.selectKeys = function(filterCallback){
		var output = [];
		for(var key in this.entries){
			var val = this.get(key);
			try{
				if(filterCallback(val)) output.push({tableKey:this.name,entryKey:key});
			} catch(e) {}
		}
		return output;
	};
	// If View doesn't exist NoSuchItem will be thrown.
	Table.prototype.getView = function(viewName){
		var output = this.views[viewName];
		if(output === undefined) module.exceptions.NoSuchItem();
		return output;
	};
	Table.prototype.makeView = function(viewName,filterCallback){
		this.views[viewName] = new View(this,viewName,filterCallback);
	};
	//=============================================================================
	/// View Object
	// A view is like a stored select statement. It allows a query-based view onto
	// the database. Views can also be used to make more views.
	//=============================================================================
	function View() {
		this.initialize.apply(this, arguments);
	}
	View.prototype.initialize = function(sourceTable,viewName,filterCallback){
		this.source = sourceTable;
		this.name = viewName;
		this.callBack = filterCallback;
		this.keys = this.source.selectKeys(this.callBack);
	};
	View.prototype.delete = function(){
		delete this.source.views[this.name];
	};
	// Internal function to rebuild the view.
	View.prototype._rebuild = function(){
		this.keys = this.source.selectKeys(this.callBack);
	};
	View.prototype.select = function(filterCallback){
		var output = [];
		for(var i in this.keys){
			var val = this.source.get(this.keys[i].entryKey);
			try{
				if(filterCallback(val)) output.push(val);
			} catch(e) {}
		}
		return output;
	};
	View.prototype.selectKeys = function(filterCallback){
		var output = [];
		for(var i in this.keys){
			var val = this.source.get(this.keys[i].entryKey);
			try{
				if(filterCallback(val)) output.push({tableKey:this.source.name,entryKey:this.keys[i].entryKey});
			} catch(e) {}
		}
		return output;		
	};
	View.prototype.getAll = function(){
		var output = [];
		for(var i in this.keys){
			output.push(this.source.get(this.keys[i].entryKey));
		}
		return output;		
	};
	View.prototype.makeView = function(viewName,filterCallback){
		var baseCallback = this.callBack;
		function newCallback (obj){
			return baseCallback(obj) && filterCallback(obj);
		}
		this.source.makeView(viewName,newCallback);
	};
	module.init();
})();